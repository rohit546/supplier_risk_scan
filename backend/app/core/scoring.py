"""Deterministic risk scoring engine.

Every dimension score is derived from raw metrics through explicit
normalization curves — no score is ever hardcoded. Inputs are plausible
business metrics; outputs are 0–100 risk indices (higher = riskier).
"""

from app.config import Settings
from app.schemas import RawMetrics, SubScores

# Static sovereign-risk reference table (0–100, higher = riskier).
# Modeled on composite indices (political stability, trade openness, sanctions).
COUNTRY_RISK: dict[str, int] = {
    "Myanmar": 92,
    "Russia": 95,
    "China": 58,
    "Taiwan": 56,
    "India": 44,
    "Vietnam": 38,
    "Mexico": 52,
    "Brazil": 48,
    "Turkey": 55,
    "United States": 18,
    "United Kingdom": 22,
    "Germany": 12,
    "France": 16,
    "Spain": 18,
    "Norway": 8,
    "Switzerland": 6,
    "Japan": 20,
    "South Korea": 30,
    "Poland": 26,
}
DEFAULT_COUNTRY_RISK = 40


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def score_financial(m: RawMetrics) -> int:
    f = m.financial
    # Credit score 850 (best) → 0 risk, 300 (worst) → 100 risk
    credit_risk = (850 - f.creditScore) / 5.5
    # DSO benchmark 45 days; every day over adds pressure
    dso_risk = clamp((f.dsoDays - 45) * 1.8, 0, 100)
    # Debt ratio above 0.4 increasingly risky
    debt_risk = clamp((f.debtRatio - 0.4) * 200, 0, 100)
    # Thin or negative margins
    margin_risk = clamp((0.10 - f.profitMargin) * 500, 0, 100)
    # Declining revenue
    trend_risk = clamp(-f.revenueTrend * 80, 0, 100)
    score = (
        credit_risk * 0.35
        + dso_risk * 0.20
        + debt_risk * 0.15
        + margin_risk * 0.15
        + trend_risk * 0.15
    )
    return int(clamp(score))


def score_operational(m: RawMetrics) -> int:
    o = m.operational
    # Shortfall vs 95% OTD target — each point under costs 9 risk points
    otd_risk = clamp((95.0 - o.onTimeDelivery) * 9, 0, 100)
    # Defect rate vs 2.0% SLA — breaching the SLA escalates steeply
    defect_risk = clamp(o.defectRate * 22, 0, 100)
    # Capacity stress: overload (>92%) or heavy underutilization (<45%)
    if o.capacityUtilization > 92:
        cap_risk = clamp((o.capacityUtilization - 92) * 8, 0, 100)
    elif o.capacityUtilization < 45:
        cap_risk = clamp((45 - o.capacityUtilization) * 2, 0, 100)
    else:
        cap_risk = 0.0
    score = otd_risk * 0.40 + defect_risk * 0.45 + cap_risk * 0.15
    return int(clamp(score))


def score_compliance(m: RawMetrics) -> int:
    c = m.compliance
    if not c.isoCertified or c.certDaysToExpiry < 0:
        days_expired = max(0, -c.certDaysToExpiry)
        cert_risk = clamp(60 + days_expired * 0.4, 0, 100)
    elif c.certDaysToExpiry < 60:
        # Approaching expiry without renewal
        cert_risk = clamp((60 - c.certDaysToExpiry) * 0.6, 0, 40)
    else:
        cert_risk = 0.0
    violation_risk = clamp(c.violations12m * 28, 0, 100)
    audit_risk = clamp((c.lastAuditDays - 180) * 0.18, 0, 100)
    score = cert_risk * 0.50 + violation_risk * 0.30 + audit_risk * 0.20
    return int(clamp(score))


def score_geopolitical(m: RawMetrics) -> int:
    g = m.geopolitical
    base = COUNTRY_RISK.get(g.country, DEFAULT_COUNTRY_RISK)
    restriction_risk = clamp(g.tradeRestrictions * 9, 0, 40)
    score = clamp(base * 0.85 + restriction_risk)
    return int(score)


def score_esg(m: RawMetrics) -> int:
    e = m.esg
    # Ratings are 0–100 where higher is better → invert to risk
    rating_risk = 100 - (e.environmental * 0.4 + e.social * 0.3 + e.governance * 0.3)
    # Negative press amplifies ESG exposure
    sentiment_risk = clamp(-e.newsSentiment * 45, 0, 45)
    score = clamp(rating_risk * 0.75 + sentiment_risk)
    return int(score)


def compute_scores(m: RawMetrics, settings: Settings) -> tuple[SubScores, int]:
    scores = SubScores(
        financial=score_financial(m),
        operational=score_operational(m),
        compliance=score_compliance(m),
        geopolitical=score_geopolitical(m),
        esg=score_esg(m),
    )
    weighted = (
        scores.financial * settings.weight_financial
        + scores.operational * settings.weight_operational
        + scores.compliance * settings.weight_compliance
        + scores.geopolitical * settings.weight_geopolitical
        + scores.esg * settings.weight_esg
    )
    worst = max(
        scores.financial, scores.operational, scores.compliance,
        scores.geopolitical, scores.esg,
    )
    # Blend weighted mean with worst-dimension dominance: a single failing
    # dimension must not be diluted away by four healthy ones.
    overall = round(0.65 * weighted + 0.35 * worst)
    return scores, int(clamp(overall))


def risk_level(score: int) -> str:
    return "high" if score >= 70 else "medium" if score >= 40 else "low"


_DRIVER_TEMPLATES: dict[str, str] = {
    "financial": "Financial stress: credit deterioration & working-capital strain",
    "operational": "Operational underperformance: delivery & quality slippage",
    "compliance": "Compliance gap: certification / regulatory exposure",
    "geopolitical": "Geopolitical exposure: country & trade-policy risk",
    "esg": "ESG exposure: environmental / social / governance flags",
}


def primary_driver(m: RawMetrics, scores: SubScores) -> str:
    pairs = [
        ("financial", scores.financial),
        ("operational", scores.operational),
        ("compliance", scores.compliance),
        ("geopolitical", scores.geopolitical),
        ("esg", scores.esg),
    ]
    dim, top = max(pairs, key=lambda p: p[1])
    if top < 35:
        return "No material risks detected"
    return _DRIVER_TEMPLATES[dim]


def explain_scores(m: RawMetrics, scores: SubScores) -> dict[str, str]:
    """Per-dimension natural-language explanation of how the score was built
    (AI-explainability: the deterministic part of the reasoning chain)."""
    f, o, c, g, e = m.financial, m.operational, m.compliance, m.geopolitical, m.esg
    cert = (
        f"certificate expired {-c.certDaysToExpiry}d ago"
        if c.certDaysToExpiry < 0
        else f"certificate valid for {c.certDaysToExpiry}d"
    )
    return {
        "financial": (
            f"Score {scores.financial}: credit {f.creditScore}/850, DSO {f.dsoDays:.0f}d vs 45d benchmark, "
            f"debt ratio {f.debtRatio:.2f}, margin {f.profitMargin * 100:.1f}%, revenue trend {f.revenueTrend:+.2f}."
        ),
        "operational": (
            f"Score {scores.operational}: OTD {o.onTimeDelivery:.1f}% vs 95% target, "
            f"defect rate {o.defectRate:.2f}% vs 2.0% SLA, capacity at {o.capacityUtilization:.0f}%."
        ),
        "compliance": (
            f"Score {scores.compliance}: ISO 9001 {'active' if c.isoCertified and c.certDaysToExpiry >= 0 else 'lapsed'}, "
            f"{cert}, {c.violations12m} violation(s) in 12m, last audit {c.lastAuditDays}d ago."
        ),
        "geopolitical": (
            f"Score {scores.geopolitical}: {g.country} sovereign-risk index "
            f"{COUNTRY_RISK.get(g.country, DEFAULT_COUNTRY_RISK)}/100, {g.tradeRestrictions} active trade restriction(s)."
        ),
        "esg": (
            f"Score {scores.esg}: E {e.environmental} / S {e.social} / G {e.governance} (higher is better), "
            f"news sentiment {e.newsSentiment:+.2f}."
        ),
    }
