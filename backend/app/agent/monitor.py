"""Autonomous monitoring agent.

An asyncio loop that continuously: drifts supplier telemetry (simulating
incoming data-feed updates), rescans risk scores through the deterministic
engine, detects threshold breaches, asks the LLM layer for recommendations
and mitigation plans, and emits everything over the live WebSocket feed.

One scan tick ≈ one simulated day (time compression for demo purposes).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.agent.llm import LLMClient
from app.config import Settings
from app.core.broadcast import Broadcaster
from app.core.scoring import compute_scores, risk_level
from app.core.store import Store, SupplierState, now_iso
from app.data.generator import METRIC_JITTER, get_path, set_path, to_raw_model
from app.schemas import AgentEvent, Alert

log = logging.getLogger("riskscan.agent")

SLA_DEFECT_RATE = 2.0
SENTIMENT_ALERT = -0.4

DIMENSIONS = ("financial", "operational", "compliance", "geopolitical", "esg")

DIM_LABELS = {
    "financial": "Financial",
    "operational": "Operational",
    "compliance": "Compliance",
    "geopolitical": "Geopolitical",
    "esg": "ESG",
}


class MonitorAgent:
    def __init__(
        self,
        store: Store,
        llm: LLMClient,
        broadcaster: Broadcaster,
        settings: Settings,
    ):
        self.store = store
        self.llm = llm
        self.broadcaster = broadcaster
        self.settings = settings
        self._rr_index = 0

    # ── Lifecycle ──────────────────────────────────────────────

    async def run(self) -> None:
        try:
            await self.initial_scan()
            while True:
                await asyncio.sleep(self.settings.scan_interval_seconds)
                await self.tick()
        except asyncio.CancelledError:
            log.info("Agent loop stopped")
            raise

    # ── Initial sweep: surface standing breaches in seeded data ─

    async def initial_scan(self) -> None:
        async with self.store.lock:
            states = list(self.store.suppliers.values())
        for st in states:
            raw_model = to_raw_model(st.raw, st.country)
            findings = []
            for dim in DIMENSIONS:
                score = getattr(st.scores, dim)
                if score >= 70:
                    findings.append(self._standing_breach(st, dim, score, raw_model))
            if raw_model.esg.newsSentiment <= SENTIMENT_ALERT and st.scores.esg < 70:
                findings.append((
                    "esg", "medium",
                    "Negative news sentiment detected",
                    f"News sentiment index at {raw_model.esg.newsSentiment:+.2f} across recent coverage; "
                    f"ESG risk score {st.scores.esg}/100 and trending adverse.",
                ))
            for category, severity, title, breach in findings:
                await self._raise_alert(st, category, severity, title, breach)
            async with self.store.lock:
                self.store.scans_completed += 1
        log.info("Initial scan complete: %d alerts raised", self.store.alerts_raised)

    def _standing_breach(
        self, st: SupplierState, dim: str, score: int, raw: Any
    ) -> tuple[str, str, str, str]:
        if dim == "operational":
            return (
                dim, "high", "Critical operational SLA breach",
                f"Defect rate at {raw.operational.defectRate:.1f}% vs 2.0% SLA limit; "
                f"on-time delivery down to {raw.operational.onTimeDelivery:.1f}% against 95% target.",
            )
        if dim == "compliance":
            expired = -raw.compliance.certDaysToExpiry
            cert_txt = (
                f"ISO 9001 certificate expired {expired} days ago"
                if expired > 0 else "certification status degraded"
            )
            return (
                dim, "high", "Compliance qualification failure",
                f"{cert_txt}; {raw.compliance.violations12m} violation(s) on record in trailing 12 months; "
                f"last audit {raw.compliance.lastAuditDays} days ago.",
            )
        if dim == "geopolitical":
            return (
                dim, "high", "Severe geopolitical exposure",
                f"Sourcing concentrated in {raw.geopolitical.country} "
                f"(sovereign-risk {raw.geopolitical.countryRisk}/100) with "
                f"{raw.geopolitical.tradeRestrictions} active trade restriction(s).",
            )
        if dim == "esg":
            return (
                dim, "high", "ESG exposure at critical level",
                f"Environmental rating {raw.esg.environmental}/100 with news sentiment "
                f"{raw.esg.newsSentiment:+.2f}; ESG risk score {score}/100.",
            )
        return (
            dim, "high", "Financial distress signals",
            f"Credit score {raw.financial.creditScore}/850, DSO {raw.financial.dsoDays:.0f} days, "
            f"debt ratio {raw.financial.debtRatio:.2f}; financial risk score {score}/100.",
        )

    # ── Live tick ──────────────────────────────────────────────

    async def tick(self) -> None:
        async with self.store.lock:
            ids = list(self.store.suppliers.keys())
        if not ids:
            return
        batch_size = max(1, self.settings.scan_batch_size)
        batch = [
            ids[(self._rr_index + i) % len(ids)] for i in range(min(batch_size, len(ids)))
        ]
        self._rr_index = (self._rr_index + batch_size) % len(ids)

        for sid in batch:
            await self._scan_supplier(sid)

    async def _scan_supplier(self, sid: str) -> None:
        async with self.store.lock:
            st = self.store.suppliers.get(sid)
            if st is None:
                return
            prev_scores = st.scores
            prev_overall = st.overall
            prev_raw = to_raw_model(st.raw, st.country)

            # 1. Drift raw telemetry (simulated data-feed update)
            for path, delta in st.drift.items():
                noise = st.rng.gauss(0, METRIC_JITTER.get(path, 0.0))
                set_path(st.raw, path, get_path(st.raw, path) + delta + noise)
            # Mild random wobble on a couple of universal metrics
            for path in ("operational.onTimeDelivery", "esg.newsSentiment"):
                wobble = st.rng.gauss(0, METRIC_JITTER.get(path, 0.0) * 0.5)
                set_path(st.raw, path, get_path(st.raw, path) + wobble)

            # 2. Rescore
            raw_model = to_raw_model(st.raw, st.country)
            scores, overall = compute_scores(raw_model, self.settings)
            st.prev_scores, st.prev_overall = prev_scores, prev_overall
            st.scores, st.overall = scores, overall
            self.store.append_history(st, overall)
            self.store.scans_completed += 1

        # 3. Emit scan/update event
        delta = overall - prev_overall
        if abs(delta) >= 2:
            await self._emit_event(
                st.name, "update",
                f"Risk re-scored: {prev_overall} → {overall}",
                f"Aggregate index moved {delta:+d} pts after telemetry refresh "
                f"({risk_level(overall)} band).",
            )
        else:
            await self._emit_event(
                st.name, "scan",
                "Routine risk scan complete",
                f"All 5 dimensions re-evaluated. Aggregate index stable at {overall} "
                f"({risk_level(overall)} band).",
            )

        # 4. Threshold detection → alerts
        for category, severity, title, breach in self._detect(
            st, prev_scores, prev_overall, prev_raw, raw_model
        ):
            await self._raise_alert(st, category, severity, title, breach)

    def _detect(self, st, prev_scores, prev_overall, prev_raw, raw):
        findings: list[tuple[str, str, str, str]] = []
        for dim in DIMENSIONS:
            prev_s = getattr(prev_scores, dim)
            new_s = getattr(st.scores, dim)
            label = DIM_LABELS[dim]
            if prev_s < 70 <= new_s:
                findings.append((
                    dim, "high",
                    f"{label} risk crossed critical threshold",
                    f"{label} score escalated {prev_s} → {new_s}, breaching the 70-point "
                    f"critical threshold.",
                ))
            elif prev_s < 40 <= new_s:
                findings.append((
                    dim, "medium",
                    f"{label} risk entered elevated band",
                    f"{label} score rose {prev_s} → {new_s}, crossing the 40-point watch threshold.",
                ))
        if (
            prev_raw.operational.defectRate <= SLA_DEFECT_RATE
            < raw.operational.defectRate
        ):
            findings.append((
                "operational", "high", "Defect rate breached SLA",
                f"Defect rate climbed to {raw.operational.defectRate:.2f}%, exceeding the 2.0% SLA limit.",
            ))
        if prev_raw.compliance.certDaysToExpiry >= 0 > raw.compliance.certDaysToExpiry:
            findings.append((
                "compliance", "high", "ISO 9001 certification expired",
                "ISO 9001 certificate passed its expiry date without renewal documentation on file.",
            ))
        if (
            prev_raw.esg.newsSentiment > SENTIMENT_ALERT
            >= raw.esg.newsSentiment
        ):
            findings.append((
                "esg", "medium", "News sentiment turned sharply negative",
                f"News sentiment index dropped to {raw.esg.newsSentiment:+.2f}; adverse coverage accelerating.",
            ))
        return findings

    # ── Alert + event emission ─────────────────────────────────

    async def _raise_alert(
        self, st: SupplierState, category: str, severity: str, title: str, breach: str
    ) -> None:
        cooldown = timedelta(minutes=self.settings.alert_cooldown_minutes)
        now = datetime.now(timezone.utc)
        last = st.last_alert_at.get(category)
        if last and now - last < cooldown:
            return
        st.last_alert_at[category] = now

        snapshot = {
            "scores": st.scores.model_dump(),
            "overall": st.overall,
            "country": st.country,
            "category": st.category,
            "tier": st.tier,
        }
        assessment = await self.llm.assess_alert(
            st.name, category, severity, title, breach, snapshot
        )

        async with self.store.lock:
            alert = Alert(
                id=self.store.next_id("alert"),
                supplierId=st.id,
                supplierName=st.name,
                category=category,  # type: ignore[arg-type]
                severity=severity,  # type: ignore[arg-type]
                timestamp=now_iso(),
                title=title,
                breach=breach,
                recommendation=assessment["recommendation"],
                reasoning=assessment["reasoning"],
                mitigationSteps=assessment["mitigation_steps"],
                source=assessment["source"],
            )
            self.store.add_alert(alert)
        await self.broadcaster.broadcast({"type": "alert", "payload": alert.model_dump()})

        await self._emit_event(
            st.name, "alert",
            f"{severity.capitalize()}-severity alert raised",
            f"{title} — {category} dimension.",
        )
        if assessment["mitigation_steps"]:
            await self._emit_event(
                st.name, "mitigation",
                "Mitigation plan drafted",
                f"{len(assessment['mitigation_steps'])}-step plan generated "
                f"({'LLM' if assessment['source'] == 'llm' else 'playbook'} reasoning).",
            )

    async def _emit_event(self, supplier_name: str, kind: str, action: str, detail: str) -> None:
        async with self.store.lock:
            event = AgentEvent(
                id=self.store.next_id("evt"),
                ts=now_iso(),
                supplierName=supplier_name,
                action=action,
                detail=detail,
                kind=kind,  # type: ignore[arg-type]
            )
            self.store.add_event(event)
        await self.broadcaster.broadcast({"type": "event", "payload": event.model_dump()})
