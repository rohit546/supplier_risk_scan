/**
 * Front-end mirror of the backend deterministic scoring engine
 * (backend/app/core/scoring.py). Given a supplier's raw metrics, it
 * reconstructs the full calculation tree — every sub-risk, the formula
 * that produced it, the per-dimension blend, and the final overall blend —
 * so the UI can show *exactly* how a score was built. Results match the
 * server to the integer.
 */

import type { SupplierDetail, SubScores } from "@/data/suppliers";

const WEIGHTS: Record<keyof SubScores, number> = {
  financial: 0.22,
  operational: 0.24,
  compliance: 0.2,
  geopolitical: 0.18,
  esg: 0.16,
};

/** Mirror of backend COUNTRY_RISK (scoring.py). Higher = riskier. */
export const COUNTRY_RISK: Record<string, number> = {
  Myanmar: 92,
  Russia: 95,
  China: 58,
  Taiwan: 56,
  India: 44,
  Vietnam: 38,
  Mexico: 52,
  Brazil: 48,
  Turkey: 55,
  "United States": 18,
  "United Kingdom": 22,
  Germany: 12,
  France: 16,
  Spain: 18,
  Norway: 8,
  Switzerland: 6,
  Japan: 20,
  "South Korea": 30,
  Poland: 26,
};
export const DEFAULT_COUNTRY_RISK = 40;
export const countryRiskFor = (country: string) =>
  COUNTRY_RISK[country] ?? DEFAULT_COUNTRY_RISK;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export type SubRisk = {
  label: string;
  value: number; // 0–100 normalized sub-risk
  formula: string; // how `value` was produced
  note: string; // plain-language meaning
  raw: string; // the raw input restated
};

export type DimensionBreakdown = {
  key: keyof SubScores;
  label: string;
  score: number; // authoritative dimension score (0–100)
  weightPct: number; // cross-dimension weight (%)
  band: "low" | "medium" | "high";
  subRisks: SubRisk[];
  combine: string; // how sub-risks blend into the dimension score
};

export type ScoreTree = {
  overall: number;
  band: "low" | "medium" | "high";
  weighted: number; // weighted mean of the five dimensions
  worst: number; // single highest dimension
  worstLabel: string;
  blend: string; // overall blend formula
  dimensions: DimensionBreakdown[];
};

const band = (s: number): "low" | "medium" | "high" =>
  s >= 70 ? "high" : s >= 40 ? "medium" : "low";

export function buildScoreTree(s: SupplierDetail): ScoreTree {
  const r = s.raw;
  const f = r.financial;
  const o = r.operational;
  const c = r.compliance;
  const g = r.geopolitical;
  const e = r.esg;

  // ── Financial ──────────────────────────────────────────────
  const creditRisk = (850 - f.creditScore) / 5.5;
  const dsoRisk = clamp((f.dsoDays - 45) * 1.8);
  const debtRisk = clamp((f.debtRatio - 0.4) * 200);
  const marginRisk = clamp((0.1 - f.profitMargin) * 500);
  const trendRisk = clamp(-f.revenueTrend * 80);

  const financial: DimensionBreakdown = {
    key: "financial",
    label: "Financial",
    score: s.scores.financial,
    weightPct: 22,
    band: band(s.scores.financial),
    subRisks: [
      {
        label: "Credit risk",
        value: round1(creditRisk),
        raw: `Credit score ${f.creditScore} / 850`,
        formula: `(850 − ${f.creditScore}) ÷ 5.5`,
        note: "Higher credit = lower risk. Spread of 550 pts maps onto 0–100.",
      },
      {
        label: "Collection risk (DSO)",
        value: round1(dsoRisk),
        raw: `${f.dsoDays.toFixed(0)} days to collect`,
        formula: `(${f.dsoDays.toFixed(0)} − 45) × 1.8`,
        note: "45-day benchmark is safe. Each slower day adds 1.8 pts.",
      },
      {
        label: "Debt risk",
        value: round1(debtRisk),
        raw: `Debt ratio ${f.debtRatio.toFixed(2)}`,
        formula: `(${f.debtRatio.toFixed(2)} − 0.40) × 200`,
        note: "Up to 40% debt is normal. Each point above adds 2 pts.",
      },
      {
        label: "Margin risk",
        value: round1(marginRisk),
        raw: `Profit margin ${(f.profitMargin * 100).toFixed(1)}%`,
        formula: `(0.10 − ${f.profitMargin.toFixed(2)}) × 500`,
        note: "10% margin is the safe target. Thin margins escalate steeply.",
      },
      {
        label: "Revenue trend risk",
        value: round1(trendRisk),
        raw: `Trend ${f.revenueTrend > 0 ? "+" : ""}${f.revenueTrend.toFixed(2)}`,
        formula: `−(${f.revenueTrend.toFixed(2)}) × 80`,
        note: "Growth = 0 risk. Decline scales toward 100.",
      },
    ],
    combine: "credit×35% + DSO×20% + debt×15% + margin×15% + trend×15%",
  };

  // ── Operational ────────────────────────────────────────────
  const otdRisk = clamp((95 - o.onTimeDelivery) * 9);
  const defectRisk = clamp(o.defectRate * 22);
  const capRisk =
    o.capacityUtilization > 92
      ? clamp((o.capacityUtilization - 92) * 8)
      : o.capacityUtilization < 45
        ? clamp((45 - o.capacityUtilization) * 2)
        : 0;

  const operational: DimensionBreakdown = {
    key: "operational",
    label: "Operational",
    score: s.scores.operational,
    weightPct: 24,
    band: band(s.scores.operational),
    subRisks: [
      {
        label: "Delivery risk (OTD)",
        value: round1(otdRisk),
        raw: `On-time delivery ${o.onTimeDelivery.toFixed(1)}%`,
        formula: `(95 − ${o.onTimeDelivery.toFixed(1)}) × 9`,
        note: "95% is the target. Each point below costs 9 pts.",
      },
      {
        label: "Quality risk (defects)",
        value: round1(defectRisk),
        raw: `Defect rate ${o.defectRate.toFixed(2)}%`,
        formula: `${o.defectRate.toFixed(2)} × 22`,
        note: "2% is the SLA limit. Breaching it escalates fast (capped 100).",
      },
      {
        label: "Capacity risk",
        value: round1(capRisk),
        raw: `Capacity ${o.capacityUtilization.toFixed(0)}%`,
        formula:
          o.capacityUtilization > 92
            ? `(${o.capacityUtilization.toFixed(0)} − 92) × 8`
            : o.capacityUtilization < 45
              ? `(45 − ${o.capacityUtilization.toFixed(0)}) × 2`
              : "within 45–92% safe band → 0",
        note: "Safe band 45–92%. Both overload and idle capacity add risk.",
      },
    ],
    combine: "delivery×40% + defects×45% + capacity×15%",
  };

  // ── Compliance ─────────────────────────────────────────────
  const expired = !c.isoCertified || c.certDaysToExpiry < 0;
  const daysExpired = Math.max(0, -c.certDaysToExpiry);
  const certRisk = expired
    ? clamp(60 + daysExpired * 0.4)
    : c.certDaysToExpiry < 60
      ? clamp((60 - c.certDaysToExpiry) * 0.6, 0, 40)
      : 0;
  const violationRisk = clamp(c.violations12m * 28);
  const auditRisk = clamp((c.lastAuditDays - 180) * 0.18);

  const compliance: DimensionBreakdown = {
    key: "compliance",
    label: "Compliance",
    score: s.scores.compliance,
    weightPct: 20,
    band: band(s.scores.compliance),
    subRisks: [
      {
        label: "Certification risk",
        value: round1(certRisk),
        raw: expired
          ? c.certDaysToExpiry < 0
            ? `ISO 9001 expired ${daysExpired}d ago`
            : "ISO 9001 not certified"
          : `ISO 9001 valid ${c.certDaysToExpiry}d`,
        formula: expired
          ? `60 base + ${daysExpired} × 0.4`
          : c.certDaysToExpiry < 60
            ? `(60 − ${c.certDaysToExpiry}) × 0.6`
            : "valid > 60d → 0",
        note: "An expired certificate starts at a 60-pt base failure.",
      },
      {
        label: "Violation risk",
        value: round1(violationRisk),
        raw: `${c.violations12m} violation(s) / 12m`,
        formula: `${c.violations12m} × 28`,
        note: "Each regulatory violation in the last year adds 28 pts.",
      },
      {
        label: "Audit staleness",
        value: round1(auditRisk),
        raw: `Last audit ${c.lastAuditDays}d ago`,
        formula: `(${c.lastAuditDays} − 180) × 0.18`,
        note: "Audits older than 180 days accrue risk per day.",
      },
    ],
    combine: "certificate×50% + violations×30% + audit×20%",
  };

  // ── Geopolitical ───────────────────────────────────────────
  const restrictionRisk = clamp(g.tradeRestrictions * 9, 0, 40);
  const geopolitical: DimensionBreakdown = {
    key: "geopolitical",
    label: "Geopolitical",
    score: s.scores.geopolitical,
    weightPct: 18,
    band: band(s.scores.geopolitical),
    subRisks: [
      {
        label: "Country risk",
        value: round1(g.countryRisk * 0.85),
        raw: `${g.country} · index ${g.countryRisk}/100`,
        formula: `${g.countryRisk} × 0.85`,
        note: "Sovereign-risk index for the supplier's country (0–100).",
      },
      {
        label: "Trade-restriction risk",
        value: round1(restrictionRisk),
        raw: `${g.tradeRestrictions} active restriction(s)`,
        formula: `${g.tradeRestrictions} × 9`,
        note: "Each tariff / sanction exposure adds 9 pts (capped at 40).",
      },
    ],
    combine: "country×0.85 + trade restrictions (added, not averaged)",
  };

  // ── ESG ────────────────────────────────────────────────────
  const ratingRisk = 100 - (e.environmental * 0.4 + e.social * 0.3 + e.governance * 0.3);
  const sentimentRisk = clamp(-e.newsSentiment * 45, 0, 45);
  const esg: DimensionBreakdown = {
    key: "esg",
    label: "ESG",
    score: s.scores.esg,
    weightPct: 16,
    band: band(s.scores.esg),
    subRisks: [
      {
        label: "Ratings risk",
        value: round1(ratingRisk * 0.75),
        raw: `E ${e.environmental} · S ${e.social} · G ${e.governance}`,
        formula: `(100 − [E×0.4 + S×0.3 + G×0.3]) × 0.75`,
        note: "Ratings are 'higher = better', so they are inverted to risk.",
      },
      {
        label: "News-sentiment risk",
        value: round1(sentimentRisk),
        raw: `Sentiment ${e.newsSentiment > 0 ? "+" : ""}${e.newsSentiment.toFixed(2)}`,
        formula: `−(${e.newsSentiment.toFixed(2)}) × 45`,
        note: "Negative press amplifies exposure (capped at 45).",
      },
    ],
    combine: "ratings×0.75 + sentiment (added, not averaged)",
  };

  const dimensions = [financial, operational, compliance, geopolitical, esg];

  // ── Overall blend ──────────────────────────────────────────
  const weighted =
    s.scores.financial * WEIGHTS.financial +
    s.scores.operational * WEIGHTS.operational +
    s.scores.compliance * WEIGHTS.compliance +
    s.scores.geopolitical * WEIGHTS.geopolitical +
    s.scores.esg * WEIGHTS.esg;

  const worstDim = dimensions.reduce((a, b) => (b.score > a.score ? b : a));

  return {
    overall: s.overall,
    band: band(s.overall),
    weighted: round1(weighted),
    worst: worstDim.score,
    worstLabel: worstDim.label,
    blend: `round( 0.65 × ${round1(weighted)} + 0.35 × ${worstDim.score} )`,
    dimensions,
  };
}

/** Raw inputs for a live score projection (manual onboarding form). */
export type RawInputs = {
  creditScore: number;
  dsoDays: number;
  debtRatio: number;
  profitMargin: number;
  revenueTrend: number;
  onTimeDelivery: number;
  defectRate: number;
  capacityUtilization: number;
  isoCertified: boolean;
  certDaysToExpiry: number;
  violations12m: number;
  lastAuditDays: number;
  countryRisk: number;
  tradeRestrictions: number;
  environmental: number;
  social: number;
  governance: number;
  newsSentiment: number;
};

/**
 * Projects dimension scores + overall from raw inputs, mirroring the backend
 * `compute_scores` (scoring.py) to the integer — including int-truncation per
 * dimension and the 0.65 weighted / 0.35 worst blend. Used for the live
 * preview while onboarding a supplier.
 */
export function projectScores(r: RawInputs): { scores: SubScores; overall: number } {
  const trunc = (v: number) => Math.trunc(clamp(v));

  const financial = trunc(
    ((850 - r.creditScore) / 5.5) * 0.35 +
      clamp((r.dsoDays - 45) * 1.8) * 0.2 +
      clamp((r.debtRatio - 0.4) * 200) * 0.15 +
      clamp((0.1 - r.profitMargin) * 500) * 0.15 +
      clamp(-r.revenueTrend * 80) * 0.15,
  );

  const capRisk =
    r.capacityUtilization > 92
      ? clamp((r.capacityUtilization - 92) * 8)
      : r.capacityUtilization < 45
        ? clamp((45 - r.capacityUtilization) * 2)
        : 0;
  const operational = trunc(
    clamp((95 - r.onTimeDelivery) * 9) * 0.4 + clamp(r.defectRate * 22) * 0.45 + capRisk * 0.15,
  );

  const expired = !r.isoCertified || r.certDaysToExpiry < 0;
  const daysExpired = Math.max(0, -r.certDaysToExpiry);
  const certRisk = expired
    ? clamp(60 + daysExpired * 0.4)
    : r.certDaysToExpiry < 60
      ? clamp((60 - r.certDaysToExpiry) * 0.6, 0, 40)
      : 0;
  const compliance = trunc(
    certRisk * 0.5 + clamp(r.violations12m * 28) * 0.3 + clamp((r.lastAuditDays - 180) * 0.18) * 0.2,
  );

  const geopolitical = trunc(clamp(r.countryRisk * 0.85 + clamp(r.tradeRestrictions * 9, 0, 40)));

  const ratingRisk = 100 - (r.environmental * 0.4 + r.social * 0.3 + r.governance * 0.3);
  const esg = trunc(clamp(ratingRisk * 0.75 + clamp(-r.newsSentiment * 45, 0, 45)));

  const scores: SubScores = { financial, operational, compliance, geopolitical, esg };
  const weighted =
    financial * WEIGHTS.financial +
    operational * WEIGHTS.operational +
    compliance * WEIGHTS.compliance +
    geopolitical * WEIGHTS.geopolitical +
    esg * WEIGHTS.esg;
  const worst = Math.max(financial, operational, compliance, geopolitical, esg);
  const overall = Math.round(0.65 * weighted + 0.35 * worst);
  return { scores, overall };
}
