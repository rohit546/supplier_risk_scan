import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart, Bar, ResponsiveContainer, Cell, Tooltip, XAxis,
} from "recharts";
import {
  AlertTriangle, Building2, ArrowUpRight, Shield, CheckCircle2,
  TrendingUp, RefreshCw, FileDown, Radar, Loader2,
} from "lucide-react";
import { useRisk } from "@/state/RiskContext";
import { RadialGauge, RiskBadge, Sparkline } from "@/components/risk/RiskPrimitives";
import { riskLevel } from "@/data/suppliers";
import { exportPortfolioPdf } from "@/lib/report/exportPdf";
import { cn, relTime } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · SCMDOJO RiskScan" },
      { name: "description", content: "Portfolio-wide supplier risk overview, live agent stream, and top exposures." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { suppliers, alerts, agentFeed, portfolioRisk, criticalCount, portfolio, runSweep } = useRisk();
  const [exporting, setExporting] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading("Generating PDF report…");
    try {
      await exportPortfolioPdf({ suppliers, alerts, portfolio });
      toast.success("Report downloaded", { id: t, description: "riskscan-report PDF saved." });
    } catch (e) {
      toast.error("Export failed", { id: t, description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setExporting(false);
    }
  };

  const handleSweep = async () => {
    if (sweeping) return;
    setSweeping(true);
    const t = toast.loading("Running full risk sweep…");
    try {
      const res = await runSweep();
      toast.success("Risk sweep complete", {
        id: t,
        description: `${res.scanned} suppliers re-scored · ${res.newAlerts} new alert${res.newAlerts === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      toast.error("Sweep failed", { id: t, description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSweeping(false);
    }
  };

  const buckets = { low: 0, medium: 0, high: 0 };
  suppliers.forEach((s) => buckets[riskLevel(s.overall)]++);
  const distData = [
    { name: "Low", value: buckets.low, color: "var(--color-risk-low)" },
    { name: "Medium", value: buckets.medium, color: "var(--color-risk-med)" },
    { name: "High", value: buckets.high, color: "var(--color-risk-high)" },
  ];
  const topRisk = [...suppliers].sort((a, b) => b.overall - a.overall).slice(0, 5);

  return (
    <div className="space-y-8 animate-rise">
      {/* ── Page header ───────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label-micro">Portfolio Overview</div>
          <h1 className="font-display text-[32px] leading-tight mt-1.5 text-foreground">
            Supplier risk, continuously watched.
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {suppliers.length} entities under autonomous monitoring · live agent stream
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            disabled={exporting || suppliers.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:shadow-premium transition-shadow cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            {exporting ? "Exporting…" : "Export report"}
          </button>
          <button
            onClick={handleSweep}
            disabled={sweeping}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {sweeping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {sweeping ? "Sweeping…" : "Run risk sweep"}
          </button>
        </div>
      </div>

      {/* ── Hero: gauge + KPIs + distribution ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Gauge */}
        <Card className="lg:col-span-4 flex flex-col items-center justify-center py-9">
          <RadialGauge value={portfolioRisk} />
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-[color:var(--color-risk-med)]" />
            {portfolio?.alertsRaised ?? 0} alerts raised by the agent this session
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2.5 w-full px-2">
            {distData.map((d) => (
              <div key={d.name} className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </div>
                <div className="font-display text-2xl mt-1 tabular-nums">{d.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* KPI stack + chart */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Stat
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Critical Alerts"
            value={criticalCount}
            accent="high"
            sub="Unacknowledged · action required"
            pulsing
          />
          <Stat
            icon={<Building2 className="h-4 w-4" />}
            label="Monitored Entities"
            value={suppliers.length}
            sub={`${buckets.high} high · ${buckets.medium} medium · ${buckets.low} low`}
          />
          <Stat
            icon={<Shield className="h-4 w-4" />}
            label="Risk Scans"
            value={portfolio?.scansCompleted ?? 0}
            accent="agent"
            sub="5 dimensions · continuous cadence"
          />

          <Card className="sm:col-span-3">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold">Risk distribution</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Entity counts across risk bands</p>
              </div>
              <span className="label-micro">Live</span>
            </div>
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={distData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="32%">
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 8px 24px -8px rgba(0,0,0,0.12)",
                    }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={72}>
                    {distData.map((d) => (<Cell key={d.name} fill={d.color} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Top exposures + agent feed ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold">Top 5 high-risk suppliers</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Ranked by overall risk index</p>
            </div>
            <Link to="/directory" className="text-xs font-semibold text-primary hover:underline">
              All suppliers →
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {topRisk.map((s, i) => (
              <Link
                key={s.id}
                to="/suppliers/$id"
                params={{ id: s.id }}
                className="flex items-center gap-4 py-4 group cursor-pointer first:pt-0 last:pb-0"
              >
                <span className="font-display text-lg text-muted-foreground/40 w-6 tabular-nums shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-36">
                  <div className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{s.country} · {s.category} · Tier {s.tier}</div>
                </div>
                <div className="hidden xl:block text-xs text-muted-foreground max-w-44 truncate shrink-0">{s.primaryDriver}</div>
                <Sparkline data={s.history} />
                <RiskBadge score={s.overall} />
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Agent activity</h3>
            </div>
            <Link to="/agent" className="text-xs font-semibold text-primary hover:underline">Configure →</Link>
          </div>
          <div className="relative flex-1 space-y-0 max-h-[26rem] overflow-y-auto scrollbar-thin pr-1.5">
            {/* timeline spine */}
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
        </Card>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card p-6 shadow-premium",
      className,
    )}>{children}</div>
  );
}

function Stat({ icon, label, value, sub, accent, pulsing }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  accent?: "high" | "med" | "low" | "agent"; pulsing?: boolean;
}) {
  const color =
    accent === "high" ? "text-[color:var(--color-risk-high)]" :
    accent === "med" ? "text-[color:var(--color-risk-med)]" :
    accent === "low" ? "text-[color:var(--color-risk-low)]" :
    accent === "agent" ? "text-primary" :
    "text-foreground";

  const iconBg =
    accent === "high" ? "bg-[color:var(--color-risk-high-bg)] text-[color:var(--color-risk-high)]" :
    accent === "med" ? "bg-[color:var(--color-risk-med-bg)] text-[color:var(--color-risk-med)]" :
    accent === "low" ? "bg-[color:var(--color-risk-low-bg)] text-[color:var(--color-risk-low)]" :
    accent === "agent" ? "bg-[color:var(--color-agent-bg)] text-primary" :
    "bg-secondary text-muted-foreground";

  return (
    <Card className="flex flex-col justify-between gap-4">
      <div className="flex items-center justify-between">
        <span className="label-micro">{label}</span>
        <span className={cn("h-8 w-8 rounded-lg grid place-items-center", iconBg)}>{icon}</span>
      </div>
      <div>
        <div className={cn("font-display text-[40px] leading-none tabular-nums flex items-center gap-2.5", color)}>
          {value}
          {pulsing && Number(value) > 0 && (
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
          )}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground mt-2">{sub}</div>}
      </div>
    </Card>
  );
}
