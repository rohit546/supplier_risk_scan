import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, Shield, AlertCircle, TrendingUp, Power, CheckCircle2,
  Radar, RefreshCw, Landmark, Truck, FileCheck2, Globe2, Leaf,
} from "lucide-react";
import { useRisk } from "@/state/RiskContext";
import { cn, relTime } from "@/lib/utils";

export const Route = createFileRoute("/agent")({
  head: () => ({ meta: [{ title: "Monitoring · SCMDOJO RiskScan" }] }),
  component: AgentPage,
});

const dimensions = [
  { key: "financial", label: "Financial Health", desc: "10-K/Q parsing, credit feeds, DSO trends", icon: Landmark, on: true, cadence: "6h" },
  { key: "operational", label: "Operational Risk", desc: "ERP + SLA stream, delivery & defect telemetry", icon: Truck, on: true, cadence: "1h" },
  { key: "compliance", label: "Compliance Risk", desc: "ISO / REACH / SVHC registries, audit trails", icon: FileCheck2, on: true, cadence: "24h" },
  { key: "geopolitical", label: "Geopolitical Risk", desc: "OFAC, tariff lists, news clusters", icon: Globe2, on: true, cadence: "3h" },
  { key: "esg", label: "ESG Risk", desc: "Satellite imagery, NGO reports, sentiment", icon: Leaf, on: true, cadence: "12h" },
];

function AgentPage() {
  const { agentFeed, portfolio } = useRisk();
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  return (
    <div className="space-y-7 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label-micro">Agent Configuration</div>
          <h1 className="font-display text-[32px] leading-tight mt-1.5 text-foreground">Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Data sources, scanning cadence, and risk thresholds</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-full border border-border bg-card p-1 shadow-premium">
            {(["auto", "manual"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn(
                "px-4 py-1.5 text-xs rounded-full capitalize transition cursor-pointer font-semibold",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}>{m}</button>
            ))}
          </div>
          <button className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Run sweep now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KPI
          icon={<Shield className="h-4 w-4" />}
          label="Agent status"
          value={portfolio?.agentStatus === "active" ? "Active" : "Idle"}
          sub="Continuous monitoring"
          accent="low"
        />
        <KPI
          icon={<Activity className="h-4 w-4" />}
          label="Risk scans"
          value={String(portfolio?.scansCompleted ?? 0)}
          sub="Across 5 dimensions"
          accent="agent"
        />
        <KPI
          icon={<AlertCircle className="h-4 w-4" />}
          label="Alerts raised"
          value={String(portfolio?.alertsRaised ?? 0)}
          sub={`${portfolio?.criticalCount ?? 0} critical unacknowledged`}
          accent="med"
        />
        <KPI
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Reasoning engine"
          value={portfolio?.llmActive ? "LLM" : "Playbook"}
          sub={portfolio?.llmActive ? `Provider: ${portfolio.llmProvider}` : "Rule-based fallback active"}
          accent="low"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-5">
            <h3 className="text-sm font-semibold">Monitoring dimensions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Toggle channels and review refresh cadence</p>
          </div>
          <div className="space-y-2.5">
            {dimensions.map(({ key, ...d }) => (
              <DimensionRow key={key} {...d} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="flex items-center gap-2 mb-5">
            <Radar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Telemetry log</h3>
          </div>
          <div className="relative max-h-[27rem] overflow-y-auto scrollbar-thin pr-1.5">
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
            {agentFeed.map((e) => {
              const dot =
                e.kind === "alert" ? "bg-[color:var(--color-risk-high)]" :
                e.kind === "mitigation" ? "bg-primary" :
                e.kind === "update" ? "bg-[color:var(--color-risk-med)]" :
                "bg-muted-foreground/40";
              return (
                <div key={e.id} className="relative pl-6 pb-5 last:pb-0">
                  <span className={cn("absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-card", dot)} />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-foreground">{e.action}</span>
                    <span suppressHydrationWarning className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">{relTime(e.ts)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{e.supplierName}</div>
                  <div className="text-[11.5px] text-muted-foreground/80 mt-1 leading-relaxed">{e.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent?: "agent" | "med" | "low";
}) {
  const color =
    accent === "agent" ? "text-primary" :
    accent === "med" ? "text-[color:var(--color-risk-med)]" :
    accent === "low" ? "text-[color:var(--color-risk-low)]" :
    "text-foreground";
  const iconBg =
    accent === "agent" ? "bg-[color:var(--color-agent-bg)] text-primary" :
    accent === "med" ? "bg-[color:var(--color-risk-med-bg)] text-[color:var(--color-risk-med)]" :
    accent === "low" ? "bg-[color:var(--color-risk-low-bg)] text-[color:var(--color-risk-low)]" :
    "bg-secondary text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
      <div className="flex items-center justify-between">
        <span className="label-micro">{label}</span>
        <span className={cn("h-8 w-8 rounded-lg grid place-items-center", iconBg)}>{icon}</span>
      </div>
      <div className={cn("font-display text-[32px] leading-none mt-4 tabular-nums", color)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-2">{sub}</div>}
    </div>
  );
}

function DimensionRow({ label, desc, icon: Icon, on: defaultOn, cadence }: {
  label: string; desc: string; icon: typeof TrendingUp; on: boolean; cadence: string;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl border border-border px-4.5 py-3.5 transition-colors",
      on ? "bg-background/60" : "bg-secondary/50 opacity-70",
    )}>
      <div className={cn(
        "h-10 w-10 rounded-xl grid place-items-center shrink-0 transition-colors",
        on ? "bg-[color:var(--color-agent-bg)] text-primary" : "bg-muted text-muted-foreground",
      )}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
        <Power className="h-3 w-3" /> every {cadence}
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        aria-label={`Toggle ${label}`}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors cursor-pointer shrink-0",
          on ? "bg-primary" : "bg-border",
        )}
      >
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
          on ? "left-[22px]" : "left-0.5",
        )} />
      </button>
    </div>
  );
}
