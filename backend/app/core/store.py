"""In-memory state store (stateless architecture — no database).

All mutable state lives here for the lifetime of the process, guarded by
an asyncio lock. Seeded fresh from the mock generator on startup.
"""

import asyncio
import random
import re
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.config import Settings
from app.core.scoring import compute_scores, explain_scores, primary_driver, risk_level
from app.data.generator import (
    HISTORY_DAYS,
    derive_trend,
    effective_drift,
    load_fixtures,
    simulate_history,
    to_raw_model,
)
from app.schemas import (
    AgentEvent,
    Alert,
    Distribution,
    NewSupplierRequest,
    Portfolio,
    SubScores,
    Supplier,
    SupplierDetail,
    SupplierMetrics,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class SupplierState:
    id: str
    name: str
    country: str
    region: str
    category: str
    tier: int
    seed: int
    raw: dict[str, Any]
    drift: dict[str, float]
    rng: random.Random
    scores: SubScores
    overall: int
    history: list[int]
    prev_scores: Optional[SubScores] = None
    prev_overall: int = 0
    last_alert_at: dict[str, datetime] = field(default_factory=dict)


class Store:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.lock = asyncio.Lock()
        self.suppliers: dict[str, SupplierState] = {}
        self.alerts: list[Alert] = []
        self.feed: deque[AgentEvent] = deque(maxlen=60)
        self.scans_completed = 0
        self.alerts_raised = 0
        self._counter = 0

    # ── Seeding ────────────────────────────────────────────────

    def seed(self) -> None:
        for fixture in load_fixtures():
            history, raw = simulate_history(fixture, self.settings)
            raw_model = to_raw_model(raw, fixture["country"])
            scores, overall = compute_scores(raw_model, self.settings)
            self.suppliers[fixture["id"]] = SupplierState(
                id=fixture["id"],
                name=fixture["name"],
                country=fixture["country"],
                region=fixture["region"],
                category=fixture["category"],
                tier=fixture["tier"],
                seed=fixture["seed"],
                raw=raw,
                drift=effective_drift(fixture.get("drift", {})),
                rng=random.Random(fixture["seed"] * 7919),
                scores=scores,
                overall=overall,
                history=history,
                prev_scores=scores,
                prev_overall=overall,
            )

    # ── Identifiers ────────────────────────────────────────────

    def next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}-{self._counter}"

    def _unique_slug(self, name: str) -> str:
        base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "supplier"
        slug = base
        n = 2
        while slug in self.suppliers:
            slug = f"{base}-{n}"
            n += 1
        return slug

    # ── Onboarding (manual supplier creation) ──────────────────

    def add_supplier(self, req: NewSupplierRequest) -> SupplierState:
        """Create a supplier from manually-entered raw metrics. Scores and a
        30-day history are derived through the same engine as seeded suppliers
        — nothing is hardcoded."""
        sid = self._unique_slug(req.name)
        seed = random.randint(1000, 999999)
        raw: dict[str, Any] = {
            "financial": {
                "creditScore": req.creditScore,
                "dsoDays": req.dsoDays,
                "debtRatio": req.debtRatio,
                "profitMargin": req.profitMargin,
                "revenueTrend": req.revenueTrend,
            },
            "operational": {
                "onTimeDelivery": req.onTimeDelivery,
                "defectRate": req.defectRate,
                "capacityUtilization": req.capacityUtilization,
            },
            "compliance": {
                "isoCertified": req.isoCertified,
                "certDaysToExpiry": req.certDaysToExpiry,
                "violations12m": req.violations12m,
                "lastAuditDays": req.lastAuditDays,
            },
            "geopolitical": {"tradeRestrictions": req.tradeRestrictions},
            "esg": {
                "environmental": req.environmental,
                "social": req.social,
                "governance": req.governance,
                "newsSentiment": req.newsSentiment,
            },
        }
        fixture = {
            "id": sid,
            "name": req.name,
            "country": req.country,
            "region": req.region,
            "category": req.category,
            "tier": req.tier,
            "seed": seed,
            "raw": raw,
            "drift": {},
        }
        history, raw_now = simulate_history(fixture, self.settings)
        raw_model = to_raw_model(raw_now, req.country)
        scores, overall = compute_scores(raw_model, self.settings)
        st = SupplierState(
            id=sid,
            name=req.name,
            country=req.country,
            region=req.region,
            category=req.category,
            tier=req.tier,
            seed=seed,
            raw=raw_now,
            drift=effective_drift({}),
            rng=random.Random(seed * 7919),
            scores=scores,
            overall=overall,
            history=history,
            prev_scores=scores,
            prev_overall=overall,
        )
        self.suppliers[sid] = st
        return st

    # ── Wire model builders ────────────────────────────────────

    def to_supplier(self, st: SupplierState) -> Supplier:
        raw_model = to_raw_model(st.raw, st.country)
        return Supplier(
            id=st.id,
            name=st.name,
            country=st.country,
            region=st.region,
            category=st.category,
            tier=st.tier,
            overall=st.overall,
            scores=st.scores,
            history=list(st.history),
            metrics=SupplierMetrics(
                onTimeDelivery=round(raw_model.operational.onTimeDelivery, 1),
                defectRate=round(raw_model.operational.defectRate, 2),
                sentiment=round(raw_model.esg.newsSentiment, 2),
                isoCertified=raw_model.compliance.isoCertified
                and raw_model.compliance.certDaysToExpiry >= 0,
                lastAuditDays=raw_model.compliance.lastAuditDays,
            ),
            primaryDriver=primary_driver(raw_model, st.scores),
            trend=derive_trend(st.history),
        )

    def to_supplier_detail(self, st: SupplierState) -> SupplierDetail:
        base = self.to_supplier(st)
        raw_model = to_raw_model(st.raw, st.country)
        return SupplierDetail(
            **base.model_dump(),
            raw=raw_model,
            explanation=explain_scores(raw_model, st.scores),
        )

    def portfolio(self, llm_provider: str, llm_active: bool) -> Portfolio:
        states = list(self.suppliers.values())
        total = len(states) or 1
        dist = {"low": 0, "medium": 0, "high": 0}
        for st in states:
            dist[risk_level(st.overall)] += 1
        return Portfolio(
            portfolioRisk=round(sum(st.overall for st in states) / total),
            distribution=Distribution(**dist),
            criticalCount=sum(
                1 for a in self.alerts if a.severity == "high" and not a.acknowledged
            ),
            unackCount=sum(1 for a in self.alerts if not a.acknowledged),
            totalSuppliers=len(states),
            scansCompleted=self.scans_completed,
            alertsRaised=self.alerts_raised,
            agentStatus="active",
            llmProvider=llm_provider,
            llmActive=llm_active,
        )

    # ── Mutations ──────────────────────────────────────────────

    def add_alert(self, alert: Alert) -> None:
        self.alerts.insert(0, alert)
        self.alerts_raised += 1

    def add_event(self, event: AgentEvent) -> None:
        self.feed.appendleft(event)

    def acknowledge(self, ids: list[str]) -> int:
        wanted = set(ids)
        count = 0
        for a in self.alerts:
            if a.id in wanted and not a.acknowledged:
                a.acknowledged = True
                count += 1
        return count

    def append_history(self, st: SupplierState, overall: int) -> None:
        st.history.append(overall)
        if len(st.history) > HISTORY_DAYS:
            st.history = st.history[-HISTORY_DAYS:]
