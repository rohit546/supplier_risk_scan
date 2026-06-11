"""Provider-agnostic LLM client with a deterministic rule-based fallback.

Supports Gemini (default), OpenAI, and Anthropic through their plain REST
APIs (httpx, no heavyweight SDKs). When no API key is configured — or any
call fails — the agent degrades gracefully to template-based reasoning so
the system always works out of the box."""

import json
import logging
import re
import time
from typing import Any, Optional

import httpx

from app.config import Settings
from app.agent.prompts import SYSTEM_PROMPT, build_alert_prompt

log = logging.getLogger("riskscan.llm")


class LLMClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.provider = settings.llm_provider.lower()

    @property
    def api_key(self) -> str:
        return {
            "gemini": self.settings.gemini_api_key,
            "openai": self.settings.openai_api_key,
            "anthropic": self.settings.anthropic_api_key,
        }.get(self.provider, "")

    @property
    def active(self) -> bool:
        return bool(self.api_key)

    @property
    def model_name(self) -> str:
        return {
            "gemini": self.settings.gemini_model,
            "openai": self.settings.openai_model,
            "anthropic": self.settings.anthropic_model,
        }.get(self.provider, "")

    async def assess_alert(
        self,
        supplier_name: str,
        category: str,
        severity: str,
        title: str,
        breach: str,
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        """Returns {recommendation, reasoning, mitigation_steps, source}."""
        result, _ = await self.assess_alert_verbose(
            supplier_name, category, severity, title, breach, snapshot
        )
        return result

    async def assess_alert_verbose(
        self,
        supplier_name: str,
        category: str,
        severity: str,
        title: str,
        breach: str,
        snapshot: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Like assess_alert but also returns a diagnostic trace (prompt sent,
        raw provider response, latency, provider/model, error) so the UI can
        prove a real LLM call happened. Returns (result, meta)."""
        prompt = build_alert_prompt(supplier_name, category, severity, title, breach, snapshot)
        meta: dict[str, Any] = {
            "provider": self.provider,
            "model": self.model_name,
            "active": self.active,
            "source": "fallback",
            "latencyMs": 0,
            "prompt": prompt,
            "rawResponse": "",
            "error": None,
        }
        started = time.perf_counter()

        if self.active:
            try:
                text = await self._call(prompt)
                meta["rawResponse"] = text
                parsed = self._parse_json(text)
                if parsed:
                    meta["source"] = "llm"
                    meta["latencyMs"] = round((time.perf_counter() - started) * 1000)
                    return (
                        {
                            "recommendation": str(parsed.get("recommendation", "")).strip(),
                            "reasoning": str(parsed.get("reasoning", "")).strip(),
                            "mitigation_steps": [str(s) for s in parsed.get("mitigation_steps", [])][:4],
                            "source": "llm",
                        },
                        meta,
                    )
                meta["error"] = "LLM returned an unparseable (non-JSON) response"
                log.warning("LLM returned unparseable response; using fallback")
            except httpx.HTTPStatusError as exc:
                body = exc.response.text[:300] if exc.response is not None else ""
                meta["error"] = f"HTTP {exc.response.status_code}: {body or exc}"
                log.warning("LLM HTTP error %s: %s", exc.response.status_code, body[:200])
            except Exception as exc:  # network, auth, rate-limit — degrade gracefully
                detail = str(exc).strip() or repr(exc)
                meta["error"] = f"{type(exc).__name__}: {detail}"
                log.warning("LLM call failed (%s); using fallback", detail)
        else:
            meta["error"] = f"No API key configured for provider '{self.provider}'"

        meta["latencyMs"] = round((time.perf_counter() - started) * 1000)
        return self._fallback(supplier_name, category, severity, breach, snapshot), meta

    # ── Provider calls ─────────────────────────────────────────

    async def _call(self, prompt: str) -> str:
        timeout = self.settings.llm_timeout_seconds
        async with httpx.AsyncClient(timeout=timeout) as client:
            if self.provider == "gemini":
                return await self._call_gemini(client, prompt)
            if self.provider == "openai":
                return await self._call_openai(client, prompt)
            if self.provider == "anthropic":
                return await self._call_anthropic(client, prompt)
            raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def _call_gemini(self, client: httpx.AsyncClient, prompt: str) -> str:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.settings.gemini_model}:generateContent"
        )
        resp = await client.post(
            url,
            headers={"x-goog-api-key": self.api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": 600,
                    "responseMimeType": "application/json",
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    async def _call_openai(self, client: httpx.AsyncClient, prompt: str) -> str:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.settings.openai_model,
                "temperature": 0.4,
                "max_tokens": 600,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    async def _call_anthropic(self, client: httpx.AsyncClient, prompt: str) -> str:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": self.settings.anthropic_model,
                "max_tokens": 600,
                "temperature": 0.4,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]

    # ── Parsing & fallback ─────────────────────────────────────

    @staticmethod
    def _parse_json(text: str) -> Optional[dict[str, Any]]:
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    return None
        return None

    @staticmethod
    def _fallback(
        supplier_name: str,
        category: str,
        severity: str,
        breach: str,
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        playbook: dict[str, dict[str, Any]] = {
            "financial": {
                "recommendation": "Tighten payment exposure: shorten credit terms and require updated financials within 14 days.",
                "reasoning": "Deteriorating financial metrics raise default and supply-continuity risk; early exposure control protects open PO value.",
                "steps": [
                    "Request latest audited financials and 12-month cash-flow forecast",
                    "Reduce open PO exposure and move to milestone-based payments",
                    "Pre-qualify one alternate source for affected categories",
                    "Set weekly credit-watch review until score recovers",
                ],
            },
            "operational": {
                "recommendation": "Launch a corrective action plan with supplier QA and cap incremental volume until two clean scans.",
                "reasoning": "Delivery and quality breaches directly threaten production schedules; containment plus dual-sourcing limits disruption.",
                "steps": [
                    "Issue 8D corrective-action request to supplier QA leadership",
                    "Activate dual-source RFQ across pre-qualified alternates",
                    "Increase inbound inspection level for next 3 shipments",
                    "Review SLA penalties at next supplier business review",
                ],
            },
            "compliance": {
                "recommendation": "Suspend new POs pending certification evidence and trigger a third-party audit.",
                "reasoning": "Lapsed certifications invalidate supplier qualification in regulated programs and create downstream audit liability.",
                "steps": [
                    "Request certification renewal evidence within 14 days",
                    "Suspend new PO release until documentation is verified",
                    "Schedule third-party compliance audit",
                    "Flag affected part numbers in the QMS",
                ],
            },
            "geopolitical": {
                "recommendation": "Model landed-cost impact and qualify a nearshore alternate to de-risk the corridor.",
                "reasoning": "Country-level instability and trade restrictions can impose sudden cost or supply shocks beyond the supplier's control.",
                "steps": [
                    "Quantify tariff/landed-cost exposure on YTD spend",
                    "Identify nearshore alternates in lower-risk corridors",
                    "Increase safety stock for single-sourced parts",
                    "Add corridor to weekly geopolitical watchlist",
                ],
            },
            "esg": {
                "recommendation": "Request a remediation plan and pause incremental volume pending independent verification.",
                "reasoning": "ESG violations carry regulatory, reputational, and contractual exposure under supply-chain due-diligence law.",
                "steps": [
                    "Request formal remediation plan with dated milestones",
                    "Commission independent ESG verification audit",
                    "Pause new sourcing volume pending findings",
                    "Review ESG scorecard at next QBR",
                ],
            },
        }
        entry = playbook.get(category, playbook["operational"])
        return {
            "recommendation": entry["recommendation"],
            "reasoning": f"{entry['reasoning']} Trigger: {breach}",
            "mitigation_steps": entry["steps"],
            "source": "fallback",
        }
