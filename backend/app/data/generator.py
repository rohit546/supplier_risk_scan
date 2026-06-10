"""Mock data generator.

Loads fixture profiles (raw business metrics + drift biases) and
back-simulates a 30-day history by reversing each supplier's drift,
then replaying it forward through the scoring engine with seeded noise.
History is therefore *derived from metric evolution*, never invented.
"""

import copy
import json
import random
from pathlib import Path
from typing import Any

from app.config import Settings
from app.core.scoring import COUNTRY_RISK, DEFAULT_COUNTRY_RISK, compute_scores
from app.schemas import RawMetrics

FIXTURES_PATH = Path(__file__).parent / "fixtures.json"

HISTORY_DAYS = 30

# Clamp ranges for every driftable metric path.
METRIC_BOUNDS: dict[str, tuple[float, float]] = {
    "financial.creditScore": (300, 850),
    "financial.dsoDays": (20, 120),
    "financial.debtRatio": (0.05, 0.95),
    "financial.profitMargin": (-0.10, 0.30),
    "financial.revenueTrend": (-1.0, 1.0),
    "operational.onTimeDelivery": (60.0, 100.0),
    "operational.defectRate": (0.0, 12.0),
    "operational.capacityUtilization": (30.0, 100.0),
    "compliance.certDaysToExpiry": (-2000, 2000),
    "compliance.violations12m": (0, 10),
    "compliance.lastAuditDays": (0, 2000),
    "geopolitical.tradeRestrictions": (0, 6),
    "esg.environmental": (0, 100),
    "esg.social": (0, 100),
    "esg.governance": (0, 100),
    "esg.newsSentiment": (-1.0, 1.0),
}

# Per-metric noise scale used when simulating day-to-day movement.
METRIC_JITTER: dict[str, float] = {
    "financial.creditScore": 1.5,
    "financial.dsoDays": 0.8,
    "financial.debtRatio": 0.004,
    "financial.profitMargin": 0.002,
    "financial.revenueTrend": 0.01,
    "operational.onTimeDelivery": 0.25,
    "operational.defectRate": 0.05,
    "operational.capacityUtilization": 0.6,
    "esg.environmental": 0.4,
    "esg.social": 0.3,
    "esg.governance": 0.3,
    "esg.newsSentiment": 0.015,
}

# Metrics that change purely with the passage of time (1 unit per simulated day).
TIME_DRIFT: dict[str, float] = {
    "compliance.certDaysToExpiry": -1.0,
    "compliance.lastAuditDays": 1.0,
}

INT_FIELDS = {
    "financial.creditScore",
    "compliance.certDaysToExpiry",
    "compliance.violations12m",
    "compliance.lastAuditDays",
    "geopolitical.tradeRestrictions",
    "esg.environmental",
    "esg.social",
    "esg.governance",
}


def get_path(raw: dict[str, Any], path: str) -> float:
    section, field = path.split(".")
    return raw[section][field]


def set_path(raw: dict[str, Any], path: str, value: float) -> None:
    section, field = path.split(".")
    lo, hi = METRIC_BOUNDS[path]
    value = max(lo, min(hi, value))
    if path in INT_FIELDS:
        value = round(value)
    raw[section][field] = value


def to_raw_model(raw: dict[str, Any], country: str) -> RawMetrics:
    geo = dict(raw["geopolitical"])
    geo["country"] = country
    geo["countryRisk"] = COUNTRY_RISK.get(country, DEFAULT_COUNTRY_RISK)
    return RawMetrics(
        financial={**raw["financial"], "creditScore": round(raw["financial"]["creditScore"])},
        operational=raw["operational"],
        compliance={
            **raw["compliance"],
            "certDaysToExpiry": round(raw["compliance"]["certDaysToExpiry"]),
            "violations12m": round(raw["compliance"]["violations12m"]),
            "lastAuditDays": round(raw["compliance"]["lastAuditDays"]),
        },
        geopolitical={**geo, "tradeRestrictions": round(geo["tradeRestrictions"])},
        esg={
            **raw["esg"],
            "environmental": round(raw["esg"]["environmental"]),
            "social": round(raw["esg"]["social"]),
            "governance": round(raw["esg"]["governance"]),
        },
    )


def effective_drift(fixture_drift: dict[str, float]) -> dict[str, float]:
    merged = dict(TIME_DRIFT)
    for path, delta in fixture_drift.items():
        merged[path] = merged.get(path, 0.0) + delta
    return merged


def load_fixtures() -> list[dict[str, Any]]:
    with open(FIXTURES_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def simulate_history(
    fixture: dict[str, Any], settings: Settings
) -> tuple[list[int], dict[str, Any]]:
    """Back-simulate HISTORY_DAYS of metric evolution ending at the fixture's
    current values. Returns (history of overall scores, current raw dict)."""
    rng = random.Random(fixture["seed"])
    drift = effective_drift(fixture.get("drift", {}))
    current = copy.deepcopy(fixture["raw"])

    # Rewind metrics to day -29.
    start = copy.deepcopy(current)
    for path, delta in drift.items():
        set_path(start, path, get_path(start, path) - delta * (HISTORY_DAYS - 1))

    history: list[int] = []
    day = copy.deepcopy(start)
    for i in range(HISTORY_DAYS):
        if i == HISTORY_DAYS - 1:
            day = copy.deepcopy(current)  # land exactly on present-day metrics
        else:
            for path, delta in drift.items():
                noise = rng.gauss(0, METRIC_JITTER.get(path, 0.0))
                base = get_path(start, path) + delta * i
                set_path(day, path, base + noise)
        raw_model = to_raw_model(day, fixture["country"])
        _, overall = compute_scores(raw_model, settings)
        history.append(overall)
    return history, current


def derive_trend(history: list[int]) -> str:
    delta = history[-1] - history[0]
    if delta > 3:
        return "up"
    if delta < -3:
        return "down"
    return "flat"
