import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getWsUrl } from "@/lib/api/client";
import type { AgentEvent, Alert, Portfolio, Supplier } from "@/data/suppliers";

const FEED_LIMIT = 60;

type Ctx = {
  suppliers: Supplier[];
  alerts: Alert[];
  agentFeed: AgentEvent[];
  portfolio: Portfolio | undefined;
  acknowledge: (id: string) => void;
  acknowledgeMany: (ids: string[]) => void;
  getSupplier: (id: string) => Supplier | undefined;
  portfolioRisk: number;
  criticalCount: number;
  unackCount: number;
  isLoading: boolean;
  liveConnected: boolean;
};

const RiskCtx = createContext<Ctx | null>(null);

export function RiskProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const wsConnected = useRef(false);

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: api.suppliers,
    refetchInterval: 15_000, // polling safety net alongside the WebSocket
  });
  const alertsQ = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    refetchInterval: 15_000,
  });
  const feedQ = useQuery({
    queryKey: ["feed"],
    queryFn: api.feed,
    refetchInterval: 30_000,
  });
  const portfolioQ = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    refetchInterval: 15_000,
  });

  // ── Live agent feed over WebSocket ───────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(getWsUrl());
      ws.onopen = () => {
        wsConnected.current = true;
      };
      ws.onmessage = (raw) => {
        try {
          const msg = JSON.parse(raw.data as string) as
            | { type: "backlog"; payload: AgentEvent[] }
            | { type: "event"; payload: AgentEvent }
            | { type: "alert"; payload: Alert };

          if (msg.type === "backlog") {
            queryClient.setQueryData<AgentEvent[]>(["feed"], msg.payload);
          } else if (msg.type === "event") {
            queryClient.setQueryData<AgentEvent[]>(["feed"], (prev = []) => {
              if (prev.some((e) => e.id === msg.payload.id)) return prev;
              return [msg.payload, ...prev].slice(0, FEED_LIMIT);
            });
            if (msg.payload.kind === "update") {
              void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
              void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
            }
          } else if (msg.type === "alert") {
            queryClient.setQueryData<Alert[]>(["alerts"], (prev = []) => {
              if (prev.some((a) => a.id === msg.payload.id)) return prev;
              return [msg.payload, ...prev];
            });
            void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
            void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        wsConnected.current = false;
        if (!disposed) retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [queryClient]);

  // ── Acknowledge mutation (single + bulk) with optimistic UI ──
  const ackMutation = useMutation({
    mutationFn: api.acknowledge,
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["alerts"] });
      const previous = queryClient.getQueryData<Alert[]>(["alerts"]);
      queryClient.setQueryData<Alert[]>(["alerts"], (prev = []) =>
        prev.map((a) => (ids.includes(a.id) ? { ...a, acknowledged: true } : a)),
      );
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["alerts"], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  const suppliers = suppliersQ.data ?? [];
  const alerts = alertsQ.data ?? [];
  const agentFeed = feedQ.data ?? [];
  const portfolio = portfolioQ.data;

  const value = useMemo<Ctx>(() => {
    const portfolioRisk =
      portfolio?.portfolioRisk ??
      (suppliers.length
        ? Math.round(suppliers.reduce((s, x) => s + x.overall, 0) / suppliers.length)
        : 0);
    const criticalCount =
      portfolio?.criticalCount ??
      alerts.filter((a) => a.severity === "high" && !a.acknowledged).length;
    const unackCount =
      portfolio?.unackCount ?? alerts.filter((a) => !a.acknowledged).length;
    return {
      suppliers,
      alerts,
      agentFeed,
      portfolio,
      portfolioRisk,
      criticalCount,
      unackCount,
      acknowledge: (id) => ackMutation.mutate([id]),
      acknowledgeMany: (ids) => ackMutation.mutate(ids),
      getSupplier: (id) => suppliers.find((s) => s.id === id),
      isLoading: suppliersQ.isPending,
      liveConnected: wsConnected.current,
    };
  }, [suppliers, alerts, agentFeed, portfolio, suppliersQ.isPending, ackMutation]);

  return <RiskCtx.Provider value={value}>{children}</RiskCtx.Provider>;
}

export function useRisk() {
  const ctx = useContext(RiskCtx);
  if (!ctx) throw new Error("useRisk must be used within RiskProvider");
  return ctx;
}
