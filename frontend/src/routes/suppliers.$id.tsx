import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Radar as RadarSeries, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  ArrowLeft, MapPin, Building2, ClipboardList, ShieldAlert, Calendar,
  Award, Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ArrowUpRight, GitBranch,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRisk } from "@/state/RiskContext";
import { api } from "@/lib/api/client";
import { CircularScore, RiskBadge, ScoreBar } from "@/components/risk/RiskPrimitives";
import { ScoreBreakdownModal } from "@/components/risk/ScoreBreakdownModal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/suppliers/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Supplier · ${params.id} · SCMDOJO RiskScan` }],
  }),
  component: SupplierDetail,
  notFoundComponent: () => (
    <div className="text-center py-24 text-muted-foreground">
      Supplier not found. <Link to="/directory" className="underline text-primary">Back to directory</Link>
    </div>
  ),
});

const dims = [
  { key: "financial", label: "Financial" },
  { key: "operational", label: "Operational" },
  { key: "compliance", label: "Compliance" },
  { key: "geopolitical", label: "Geopolitical" },
  { key: "esg", label: "ESG" },
] as const;

function SupplierDetail() {
  const { id } = Route.useParams();
  const { getSupplier, alerts, isLoading } = useRisk();
  const [showCalc, setShowCalc] = useState(false);
  const detailQ = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api.supplier(id),
    refetchInterval: 15_000,
  });
  const s = detailQ.data ?? getSupplier(id);
  if (!s) {
    if (isLoading) {
      return (
        <div className="space-y-6 animate-rise">
          <div className="rounded-2xl border border-border bg-card p-7 shadow-premium h-48 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-premium h-96 animate-pulse" />
            <div className="rounded-2xl border border-border bg-card p-6 shadow-premium h-96 animate-pulse" />
          </div>
        </div>
      );
    }
    throw notFound();
  }

  const radarData = dims.map((d) => ({ dim: d.label, score: s.scores[d.key] }));
  const lineData = s.history.map((v, i) => ({
    day: `D${i - (s.history.length - 1)}`,
    score: v,
  }));
  const delta = s.history[s.history.length - 1] - s.history[0];
  const supplierAlerts = alerts.filter((a) => a.supplierId === s.id);

  return (
    <div className="space-y-6 animate-rise">
      <Link to="/directory" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to suppliers
      </Link>

      {/* ── Identity header ───────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-7 shadow-premium">
        <div className="flex flex-col lg:flex-row gap-7 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex flex-col items-center gap-3">
              <CircularScore value={s.overall} />
              <button
                onClick={() => setShowCalc(true)}
                disabled={!detailQ.data}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-semibold text-foreground hover:shadow-premium hover:border-primary/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <GitBranch className="h-3.5 w-3.5 text-primary" /> How is this calculated?
              </button>
            </div>
            <div>
              <div className="flex items-center gap-2 label-micro">
                <Building2 className="h-3.5 w-3.5" /> Tier {s.tier} · {s.category}
              </div>
              <h1 className="font-display text-[34px] leading-tight mt-1.5">{s.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {s.country} · {s.region}
                </span>
                <RiskBadge score={s.overall} />
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                  delta > 0 ? "text-[color:var(--color-risk-high)]" : delta < 0 ? "text-[color:var(--color-risk-low)]" : "text-muted-foreground",
                )}>
                  {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {delta >= 0 ? "+" : ""}{delta} pts · 30d
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:w-auto w-full">
            <MetricMini label="On-time delivery" value={`${s.metrics.onTimeDelivery}%`} good={s.metrics.onTimeDelivery >= 95} />
            <MetricMini label="Defect rate" value={`${s.metrics.defectRate}%`} good={s.metrics.defectRate < 2} />
            <MetricMini label="News sentiment" value={s.metrics.sentiment.toFixed(2)} good={s.metrics.sentiment >= 0} />
            <MetricMini label="ISO 9001" value={s.metrics.isoCertified ? "Active" : "Expired"} good={s.metrics.isoCertified} icon={<Award className="h-3 w-3" />} />
          </div>
        </div>
      </div>

      {/* ── Radar + timeline ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Risk surface · 5 dimensions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Higher = riskier · distortion exposes failing dimensions</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="76%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11.5 }} />
                <RadarSeries
                  name="Risk"
                  dataKey="score"
                  stroke="var(--color-agent)"
                  fill="var(--color-agent)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-3">
            {dims.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold w-24 shrink-0">{d.label}</span>
                <ScoreBar score={s.scores[d.key]} className="flex-1" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Risk timeline · 30 days</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Daily aggregate score</p>
            </div>
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
              delta > 0 ? "text-[color:var(--color-risk-high)]" : "text-[color:var(--color-risk-low)]",
            )}>
              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {delta >= 0 ? "+" : ""}{delta} pts
            </span>
          </div>
          <div className="h-[26.5rem]">
            <ResponsiveContainer>
              <AreaChart data={lineData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-agent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-agent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10.5 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10.5 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="score" stroke="var(--color-agent)" strokeWidth={2.25} fill="url(#riskFill)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Remediation panel ─────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-7 shadow-premium">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-primary grid place-items-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="label-micro">Risk Management</div>
            <div className="text-[15px] font-semibold text-foreground mt-0.5">Diagnosis & Prescribed Action Plan</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3.5 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[color:var(--color-risk-high)]" /> Incident diagnosis
            </h4>
            <div className="text-[13.5px] text-foreground/80 leading-relaxed space-y-3">
              {diagnosisFor(s).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            {detailQ.data?.explanation && (
              <div className="mt-5 rounded-xl border border-border bg-background/60 px-4 py-3.5">
                <div className="label-micro mb-2.5">Scoring engine breakdown</div>
                <div className="space-y-2">
                  {dims.map((d) => (
                    <p key={d.key} className="text-[12px] leading-relaxed text-muted-foreground">
                      {detailQ.data.explanation[d.key]}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3.5 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Action plan
            </h4>
            <ol className="space-y-3.5 text-[13.5px]">
              {actionPlanFor(s).map((a, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-[color:var(--color-agent-bg)] text-primary grid place-items-center font-display text-[13px]">{i + 1}</span>
                  <span className="text-foreground/80 leading-relaxed">{a}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-7 pt-6 border-t border-border flex flex-wrap items-center gap-2.5">
          <button className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition cursor-pointer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Execute action plan
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:shadow-premium transition-shadow cursor-pointer">
            <Calendar className="h-3.5 w-3.5" /> Schedule supplier QBR
          </button>
        </div>
      </div>

      {/* ── Linked alerts ─────────────────────────────────── */}
      {supplierAlerts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
          <h3 className="text-sm font-semibold mb-4">Active alerts · {supplierAlerts.length}</h3>
          <div className="space-y-2.5">
            {supplierAlerts.map((a) => (
              <Link
                key={a.id}
                to="/alerts"
                className="flex items-start gap-3.5 rounded-xl border border-border bg-background/60 px-4 py-3.5 hover:shadow-premium transition-shadow cursor-pointer group"
              >
                <AlertTriangle className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  a.severity === "high" ? "text-[color:var(--color-risk-high)]" :
                  a.severity === "medium" ? "text-[color:var(--color-risk-med)]" :
                  "text-[color:var(--color-risk-low)]",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.breach}</div>
                </div>
                {a.acknowledged
                  ? <span className="text-[10px] rounded-full bg-secondary text-muted-foreground px-2.5 py-1 font-semibold shrink-0">Acknowledged</span>
                  : <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />}
              </Link>
            ))}
          </div>
        </div>
      )}

      {detailQ.data && (
        <ScoreBreakdownModal supplier={detailQ.data} open={showCalc} onOpenChange={setShowCalc} />
      )}
    </div>
  );
}

function MetricMini({ label, value, good, icon }: { label: string; value: string; good?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
      <div className="flex items-center gap-1.5 label-micro">
        {icon}{label}
      </div>
      <div className={cn(
        "font-display text-xl mt-1.5 tabular-nums",
        good === undefined ? "" : good ? "text-[color:var(--color-risk-low)]" : "text-[color:var(--color-risk-high)]",
      )}>{value}</div>
    </div>
  );
}

function diagnosisFor(s: { name: string; scores: Record<string, number>; metrics: { defectRate: number; onTimeDelivery: number; isoCertified: boolean; sentiment: number } }) {
  const out: string[] = [];
  if (s.scores.operational >= 70) out.push(`Operational dimension is the dominant failure vector — defect rate of ${s.metrics.defectRate}% breaches the 2.0% SLA threshold and on-time delivery has eroded to ${s.metrics.onTimeDelivery}%.`);
  if (s.scores.geopolitical >= 70) out.push(`Geopolitical exposure is elevated due to sourcing concentration in a sanctioned/high-risk corridor. Probability of disruption inside 90 days is modeled at 38%.`);
  if (!s.metrics.isoCertified) out.push(`Compliance posture is compromised: ISO 9001 certification has lapsed, invalidating supplier qualification status across regulated programs.`);
  if (s.metrics.sentiment < -0.2) out.push(`News sentiment is trending negative (${s.metrics.sentiment.toFixed(2)}) — 12 articles in trailing 30 days cite quality or governance concerns.`);
  if (out.length === 0) out.push(`${s.name} exhibits stable performance across all five dimensions. No corrective intervention is recommended at this time. Continue routine monitoring cadence.`);
  return out;
}

function actionPlanFor(s: { overall: number; metrics: { isoCertified: boolean } }) {
  if (s.overall < 30) return [
    "Maintain current PO volume — no action required.",
    "Consider expanding allocation to capture preferred-supplier rebate tier.",
    "Schedule biannual relationship review.",
  ];
  if (s.overall < 60) return [
    "Trigger 30-day improvement plan with QA leadership.",
    "Cap incremental PO volume until two consecutive clean scans.",
    "Increase scan cadence from 24h → 6h.",
  ];
  return [
    "Shift 20% capacity to Reliable Components Inc within 72h.",
    `${s.metrics.isoCertified ? "Re-audit" : "Suspend"} new POs pending certification restoration.`,
    "Activate dual-source RFQ across 3 pre-qualified alternates.",
    "Brief executive risk committee at next weekly cadence.",
  ];
}
