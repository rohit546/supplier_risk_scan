import type {
  AgentEvent,
  Alert,
  AssessmentResult,
  Portfolio,
  Supplier,
  SupplierDetail,
} from "@/data/suppliers";

/**
 * Resolve the backend base URL at call time (not module-load time) so a
 * server-injected runtime value (window.__RISK_API_URL__) is always honoured.
 *
 * Priority:
 *   1. window.__RISK_API_URL__  — injected per-request by the SSR server
 *      (set from the RISK_API_URL / VITE_API_URL env var at runtime).
 *   2. import.meta.env.VITE_API_URL — baked in at build time.
 *   3. http://localhost:8000 — local dev default.
 *
 * This makes the deployed app work whether or not the build received the
 * variable, eliminating the "rebuild required" footgun on hosts like Railway.
 */
function resolveBaseUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { __RISK_API_URL__?: string }).__RISK_API_URL__;
    if (typeof injected === "string" && injected.trim()) {
      return injected.trim().replace(/\/+$/, "");
    }
  }
  const env = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
  return env.replace(/\/+$/, "");
}

export function getApiUrl(): string {
  return resolveBaseUrl();
}

/** Build a WebSocket URL without accidental `//ws/feed` double slashes. */
export function getWsUrl(): string {
  const base = resolveBaseUrl();
  if (!base) {
    throw new Error("API base URL is not configured (set VITE_API_URL on the frontend service)");
  }
  const wsBase = base.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  return new URL("/ws/feed", wsBase).href;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export type NewSupplierInput = {
  name: string;
  country: string;
  region: string;
  category: string;
  tier: number;
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
  tradeRestrictions: number;
  environmental: number;
  social: number;
  governance: number;
  newsSentiment: number;
};

export const api = {
  portfolio: () => get<Portfolio>("/api/portfolio"),
  suppliers: () => get<Supplier[]>("/api/suppliers"),
  supplier: (id: string) => get<SupplierDetail>(`/api/suppliers/${id}`),
  createSupplier: async (input: NewSupplierInput): Promise<SupplierDetail> => {
    const res = await fetch(`${getApiUrl()}/api/suppliers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      let detail = `POST /api/suppliers failed: ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        /* keep default */
      }
      throw new Error(detail);
    }
    return res.json() as Promise<SupplierDetail>;
  },
  alerts: () => get<Alert[]>("/api/alerts"),
  feed: () => get<AgentEvent[]>("/api/feed"),
  assessAlert: async (id: string): Promise<AssessmentResult> => {
    const res = await fetch(`${getApiUrl()}/api/alerts/${id}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      let detail = `POST /api/alerts/${id}/assess failed: ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        /* keep default */
      }
      throw new Error(detail);
    }
    return res.json() as Promise<AssessmentResult>;
  },
  acknowledge: async (ids: string[]): Promise<Alert[]> => {
    const res = await fetch(`${getApiUrl()}/api/alerts/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`POST /api/alerts/ack failed: ${res.status}`);
    return res.json() as Promise<Alert[]>;
  },
};
