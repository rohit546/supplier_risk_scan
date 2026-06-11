/** Shared domain types — mirror the backend Pydantic schemas
 * (backend/app/schemas.py). All data now comes from the API. */

export type RiskLevel = "low" | "medium" | "high";

export type SubScores = {
  financial: number;
  operational: number;
  compliance: number;
  geopolitical: number;
  esg: number;
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  region: string;
  category: string;
  tier: number;
  overall: number;
  scores: SubScores;
  history: number[]; // 30 days, oldest first
  metrics: {
    onTimeDelivery: number; // %
    defectRate: number; // %
    sentiment: number; // -1..1
    isoCertified: boolean;
    lastAuditDays: number;
  };
  primaryDriver: string;
  trend: "up" | "down" | "flat";
};

export type SupplierDetail = Supplier & {
  raw: {
    financial: {
      creditScore: number;
      dsoDays: number;
      debtRatio: number;
      profitMargin: number;
      revenueTrend: number;
    };
    operational: {
      onTimeDelivery: number;
      defectRate: number;
      capacityUtilization: number;
    };
    compliance: {
      isoCertified: boolean;
      certDaysToExpiry: number;
      violations12m: number;
      lastAuditDays: number;
    };
    geopolitical: {
      country: string;
      countryRisk: number;
      tradeRestrictions: number;
    };
    esg: {
      environmental: number;
      social: number;
      governance: number;
      newsSentiment: number;
    };
  };
  explanation: Record<keyof SubScores, string>;
};

export type Alert = {
  id: string;
  supplierId: string;
  supplierName: string;
  category: keyof SubScores;
  severity: RiskLevel;
  timestamp: string;
  title: string;
  breach: string;
  recommendation: string;
  reasoning: string;
  mitigationSteps: string[];
  source: "llm" | "fallback" | "pending";
  acknowledged: boolean;
  assessedAt?: string | null;
};

export type AssessmentMeta = {
  provider: string;
  model: string;
  active: boolean;
  source: "llm" | "fallback";
  latencyMs: number;
  prompt: string;
  rawResponse: string;
  error?: string | null;
};

export type AssessmentResult = {
  alert: Alert;
  meta: AssessmentMeta;
};

export type AgentEvent = {
  id: string;
  ts: string;
  supplierName: string;
  action: string;
  detail: string;
  kind: "scan" | "alert" | "update" | "mitigation";
};

export type Portfolio = {
  portfolioRisk: number;
  distribution: { low: number; medium: number; high: number };
  criticalCount: number;
  unackCount: number;
  totalSuppliers: number;
  scansCompleted: number;
  alertsRaised: number;
  agentStatus: string;
  llmProvider: string;
  llmActive: boolean;
  llmMode?: string;
  pendingAssessments?: number;
};

export const riskLevel = (score: number): RiskLevel =>
  score >= 70 ? "high" : score >= 40 ? "medium" : "low";
