"""Pydantic wire models. Field names intentionally mirror the frontend
TypeScript types (camelCase where the UI expects it) so the API is a
drop-in replacement for the previous client-side seed data."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

RiskLevelT = Literal["low", "medium", "high"]
TrendT = Literal["up", "down", "flat"]
EventKindT = Literal["scan", "alert", "update", "mitigation"]
DimensionT = Literal["financial", "operational", "compliance", "geopolitical", "esg"]


class SubScores(BaseModel):
    financial: int
    operational: int
    compliance: int
    geopolitical: int
    esg: int


class SupplierMetrics(BaseModel):
    onTimeDelivery: float
    defectRate: float
    sentiment: float
    isoCertified: bool
    lastAuditDays: int


class RawFinancial(BaseModel):
    creditScore: int           # 300–850, higher = healthier
    dsoDays: float             # days sales outstanding, benchmark ~45
    debtRatio: float           # 0–1
    profitMargin: float        # fraction, e.g. 0.08
    revenueTrend: float        # -1..1 yoy direction


class RawOperational(BaseModel):
    onTimeDelivery: float      # %
    defectRate: float          # %
    capacityUtilization: float # %


class RawCompliance(BaseModel):
    isoCertified: bool
    certDaysToExpiry: int      # negative = expired N days ago
    violations12m: int
    lastAuditDays: int


class RawGeopolitical(BaseModel):
    country: str
    countryRisk: int           # 0–100 from static country-risk table
    tradeRestrictions: int     # count of active restrictions / tariff exposures


class RawEsg(BaseModel):
    environmental: int         # 0–100, higher = better
    social: int
    governance: int
    newsSentiment: float       # -1..1


class RawMetrics(BaseModel):
    financial: RawFinancial
    operational: RawOperational
    compliance: RawCompliance
    geopolitical: RawGeopolitical
    esg: RawEsg


class Supplier(BaseModel):
    id: str
    name: str
    country: str
    region: str
    category: str
    tier: int
    overall: int
    scores: SubScores
    history: list[int]
    metrics: SupplierMetrics
    primaryDriver: str
    trend: TrendT


class SupplierDetail(Supplier):
    raw: RawMetrics
    explanation: dict[str, str]  # per-dimension reasoning behind the score


class Alert(BaseModel):
    id: str
    supplierId: str
    supplierName: str
    category: DimensionT
    severity: RiskLevelT
    timestamp: str
    title: str
    breach: str
    recommendation: str
    reasoning: str = ""
    mitigationSteps: list[str] = []
    source: Literal["llm", "fallback", "pending"] = "fallback"
    acknowledged: bool = False
    assessedAt: Optional[str] = None


class AssessmentMeta(BaseModel):
    """Diagnostic trace of a manual LLM assessment, surfaced to the UI so an
    operator can visually verify a real provider call happened."""
    provider: str
    model: str
    active: bool
    source: Literal["llm", "fallback"]
    latencyMs: int
    prompt: str
    rawResponse: str = ""
    error: Optional[str] = None


class AssessmentResult(BaseModel):
    alert: Alert
    meta: AssessmentMeta


class AgentEvent(BaseModel):
    id: str
    ts: str
    supplierName: str
    action: str
    detail: str
    kind: EventKindT


class Distribution(BaseModel):
    low: int
    medium: int
    high: int


class Portfolio(BaseModel):
    portfolioRisk: int
    distribution: Distribution
    criticalCount: int
    unackCount: int
    totalSuppliers: int
    scansCompleted: int
    alertsRaised: int
    agentStatus: str
    llmProvider: str
    llmActive: bool
    llmMode: str = "manual"
    pendingAssessments: int = 0


class AckRequest(BaseModel):
    ids: list[str]


class NewSupplierRequest(BaseModel):
    """Manual supplier onboarding payload. Bounds mirror the mock-data
    generator's METRIC_BOUNDS so manually-added suppliers stay in the same
    plausible ranges as seeded ones. Higher-is-worse vs higher-is-better is
    documented per field in the UI."""

    # Identity
    name: str = Field(min_length=2, max_length=80)
    country: str = Field(min_length=2, max_length=60)
    region: str = Field(min_length=2, max_length=60)
    category: str = Field(min_length=2, max_length=60)
    tier: int = Field(ge=1, le=3)

    # Financial
    creditScore: int = Field(ge=300, le=850)
    dsoDays: float = Field(ge=20, le=120)
    debtRatio: float = Field(ge=0.05, le=0.95)
    profitMargin: float = Field(ge=-0.10, le=0.30)
    revenueTrend: float = Field(ge=-1.0, le=1.0)

    # Operational
    onTimeDelivery: float = Field(ge=60.0, le=100.0)
    defectRate: float = Field(ge=0.0, le=12.0)
    capacityUtilization: float = Field(ge=30.0, le=100.0)

    # Compliance
    isoCertified: bool = True
    certDaysToExpiry: int = Field(ge=-2000, le=2000)
    violations12m: int = Field(ge=0, le=10)
    lastAuditDays: int = Field(ge=0, le=2000)

    # Geopolitical
    tradeRestrictions: int = Field(ge=0, le=6)

    # ESG
    environmental: int = Field(ge=0, le=100)
    social: int = Field(ge=0, le=100)
    governance: int = Field(ge=0, le=100)
    newsSentiment: float = Field(ge=-1.0, le=1.0)


class Health(BaseModel):
    status: str
    llmProvider: str
    llmActive: bool
    suppliers: int
