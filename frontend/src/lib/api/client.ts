import type { AgentEvent, Alert, Portfolio, Supplier, SupplierDetail } from "@/data/suppliers";

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const WS_URL = `${API_URL.replace(/^http/, "ws")}/ws/feed`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
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
    const res = await fetch(`${API_URL}/api/suppliers`, {
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
  acknowledge: async (ids: string[]): Promise<Alert[]> => {
    const res = await fetch(`${API_URL}/api/alerts/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`POST /api/alerts/ack failed: ${res.status}`);
    return res.json() as Promise<Alert[]>;
  },
};
