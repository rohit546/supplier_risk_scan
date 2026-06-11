import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ClipboardList,
  ShieldCheck,
  CheckCheck,
  ArrowUpRight,
  Sparkles,
  Loader2,
  ChevronDown,
  Cpu,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { useRisk } from "@/state/RiskContext";
import type { Alert, AssessmentMeta } from "@/data/suppliers";
import { cn, relTime } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alerts · SCMDOJO RiskScan" }] }),
  component: AlertsPage,
});

type Tab = "all" | "unack" | "critical" | "ack";
const tabs: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unack", label: "Unacknowledged" },
  { id: "critical", label: "Critical" },
  { id: "ack", label: "Acknowledged" },
];

function AlertsPage() {
  const { alerts, acknowledgeMany, portfolio } = useRisk();
  const [tab, setTab] = useState<Tab>("unack");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    switch (tab) {
      case "unack": return alerts.filter((a) => !a.acknowledged);
      case "critical": return alerts.filter((a) => a.severity === "high");
      case "ack": return alerts.filter((a) => a.acknowledged);
      default: return alerts;
    }
  }, [alerts, tab]);

  const counts = {
    all: alerts.length,
    unack: alerts.filter((a) => !a.acknowledged).length,
    critical: alerts.filter((a) => a.severity === "high").length,
    ack: alerts.filter((a) => a.acknowledged).length,
  };

  const pendingCount = alerts.filter((a) => a.source === "pending").length;
  const mode = (portfolio?.llmMode ?? "manual").toLowerCase();
  const provider = portfolio?.llmProvider ?? "gemini";
  const keyActive = portfolio?.llmActive ?? false;

  const selectableIds = filtered.filter((a) => !a.acknowledged).map((a) => a.id);
  const selectedVisible = selectableIds.filter((id) => selected.has(id));
  const allSelected = selectableIds.length > 0 && selectedVisible.length === selectableIds.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds));

  const bulkAcknowledge = () => {
    acknowledgeMany(selectedVisible);
    setSelected(new Set());
  };

  return (
    <div className="space-y-7 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label-micro">Operations</div>
          <h1 className="font-display text-[32px] leading-tight mt-1.5 text-foreground">Alerts Center</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Agent-raised flags with operator-triggered AI remediation</p>
        </div>

        {/* Bulk action bar */}
        <div className="flex items-center gap-2.5">
          {selectableIds.length > 0 && (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-border accent-[color:var(--color-primary)] cursor-pointer"
              />
              Select all
            </label>
          )}
          <button
            onClick={bulkAcknowledge}
            disabled={selectedVisible.length === 0}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition cursor-pointer",
              selectedVisible.length > 0
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-secondary text-muted-foreground/60 cursor-not-allowed",
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Acknowledge {selectedVisible.length > 0 ? `(${selectedVisible.length})` : "selected"}
          </button>
        </div>
      </div>

      {/* LLM mode banner — context for assessors */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-premium flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-lg bg-[color:var(--color-agent-bg)] text-[color:var(--color-agent)] grid place-items-center">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="label-micro">Assessment mode</div>
            <div className="text-[13px] font-semibold text-foreground">
              {mode === "manual" ? "Manual — operator triggers each AI call" : "Automatic"}
            </div>
          </div>
        </div>
        <div className="hidden sm:block h-8 w-px bg-border" />
        <div>
          <div className="label-micro">Provider</div>
          <div className="text-[13px] font-semibold text-foreground tabular-nums">{provider}</div>
        </div>
        <div>
          <div className="label-micro">API key</div>
          <div className={cn(
            "text-[13px] font-semibold tabular-nums",
            keyActive ? "text-[color:var(--color-risk-low)]" : "text-[color:var(--color-risk-med)]",
          )}>
            {keyActive ? "Active — real LLM calls" : "Not set — will show PLAYBOOK"}
          </div>
        </div>
        <div className="sm:ml-auto rounded-full bg-[color:var(--color-risk-med-bg)] text-[color:var(--color-risk-med)] px-3.5 py-1.5 text-xs font-bold tabular-nums">
          {pendingCount} pending assessment{pendingCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex items-center rounded-full border border-border bg-card p-1 w-fit shadow-premium overflow-x-auto max-w-full">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-xs rounded-full transition font-semibold cursor-pointer flex items-center gap-2 whitespace-nowrap",
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            <span className={cn(
              "text-[10px] rounded-full px-1.5 py-px font-bold tabular-nums",
              tab === t.id ? "bg-white/20" : "bg-secondary",
            )}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-14 text-center shadow-premium">
            <ShieldCheck className="h-10 w-10 mx-auto text-[color:var(--color-risk-low)] mb-4" />
            <div className="font-display text-lg text-foreground">All clear</div>
            <div className="text-xs text-muted-foreground mt-1.5">No alerts in this view. The monitoring network is stable.</div>
          </div>
        )}

        {filtered.map((a) => (
          <AlertCard
            key={a.id}
            alert={a}
            selected={selected.has(a.id)}
            onToggleSelect={() => toggle(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  alert: a,
  selected,
  onToggleSelect,
}: {
  alert: Alert;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { acknowledge, assessAlert, portfolio } = useRisk();
  const [running, setRunning] = useState(false);
  const [meta, setMeta] = useState<AssessmentMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const provider = portfolio?.llmProvider ?? "gemini";

  const runAssessment = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await assessAlert(a.id);
      setMeta(result.meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setRunning(false);
    }
  };

  const sevText =
    a.severity === "high" ? "text-[color:var(--color-risk-high)]" :
    a.severity === "medium" ? "text-[color:var(--color-risk-med)]" :
    "text-[color:var(--color-risk-low)]";
  const sevBg =
    a.severity === "high" ? "bg-[color:var(--color-risk-high-bg)]" :
    a.severity === "medium" ? "bg-[color:var(--color-risk-med-bg)]" :
    "bg-[color:var(--color-risk-low-bg)]";

  const isPending = a.source === "pending";
  const sourceBadge =
    a.source === "llm" ? { label: "AI REASONED", cls: "bg-[color:var(--color-agent)]/12 text-[color:var(--color-agent)]" } :
    a.source === "fallback" ? { label: "PLAYBOOK", cls: "bg-secondary text-muted-foreground" } :
    { label: "PENDING", cls: "bg-[color:var(--color-risk-med-bg)] text-[color:var(--color-risk-med)]" };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-premium hover-lift transition-all",
        a.acknowledged && "opacity-65",
      )}
    >
      <div className="flex items-start gap-4">
        {!a.acknowledged && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-2.5 h-4 w-4 rounded border-border accent-[color:var(--color-primary)] cursor-pointer shrink-0"
          />
        )}
        <div className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", sevBg, sevText)}>
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">{a.title}</h3>
            <span className={cn("text-[10px] uppercase tracking-[0.14em] rounded-full px-2.5 py-1 font-bold", sevBg, sevText)}>
              {a.severity}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] rounded-full bg-secondary text-muted-foreground px-2.5 py-1 font-semibold">
              {a.category}
            </span>
            <span suppressHydrationWarning className="text-xs text-muted-foreground inline-flex items-center gap-1.5 ml-auto tabular-nums">
              <Clock className="h-3 w-3" /> {relTime(a.timestamp)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">{a.supplierName}</div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="rounded-xl bg-background/70 border border-border px-4 py-3.5">
              <div className="label-micro mb-1.5">Metric breach</div>
              <p className="text-[13px] leading-relaxed text-foreground/90">{a.breach}</p>
              {a.reasoning && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <div className="label-micro mb-1.5">Why this matters</div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">{a.reasoning}</p>
                </div>
              )}
            </div>
            <div className="rounded-xl bg-[color:var(--color-agent-bg)] border border-[color:var(--color-agent)]/15 px-4 py-3.5">
              <div className="label-micro mb-1.5 !text-[color:var(--color-agent)] flex items-center gap-1.5">
                <ClipboardList className="h-3 w-3" /> Recommended action
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.12em]", sourceBadge.cls)}>
                  {sourceBadge.label}
                </span>
              </div>

              {isPending && !running ? (
                <div className="py-2">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    No assessment yet. Send this alert's context to the {provider} model to
                    generate a recommendation and mitigation plan.
                  </p>
                  <button
                    onClick={runAssessment}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--color-agent)] text-white px-4 py-2 text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Run AI Assessment
                  </button>
                </div>
              ) : running ? (
                <div className="py-3 flex items-center gap-2.5 text-[13px] text-[color:var(--color-agent)] font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Contacting {provider} model…
                </div>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-foreground/90">{a.recommendation}</p>
                  {a.mitigationSteps?.length > 0 && (
                    <ol className="mt-3 pt-3 border-t border-[color:var(--color-agent)]/10 space-y-1.5">
                      {a.mitigationSteps.map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground/80">
                          <span className="h-4.5 w-4.5 shrink-0 rounded-full bg-card text-primary grid place-items-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}

              {error && (
                <div className="mt-3 text-[12px] text-[color:var(--color-risk-high)] font-medium">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Transparency panel — proves the call routed to the LLM */}
          {meta && (
            <div className="mt-3.5 rounded-xl border border-border bg-background/60 px-4 py-3.5">
              <div className="label-micro mb-2.5 flex items-center gap-1.5">
                <Cpu className="h-3 w-3" /> LLM call trace
              </div>
              <div className="flex flex-wrap gap-2">
                <TraceChip label="Provider" value={`${meta.provider}/${meta.model}`} />
                <TraceChip
                  label="Routed to"
                  value={meta.source === "llm" ? "LIVE LLM" : "PLAYBOOK FALLBACK"}
                  tone={meta.source === "llm" ? "good" : "warn"}
                />
                <TraceChip label="Latency" value={`${meta.latencyMs} ms`} icon={<Gauge className="h-3 w-3" />} />
                <TraceChip
                  label="API key"
                  value={meta.active ? "active" : "absent"}
                  tone={meta.active ? "good" : "warn"}
                />
              </div>

              {meta.error && (
                <div className="mt-2.5 text-[12px] text-[color:var(--color-risk-med)]">
                  Fallback reason: {meta.error}
                </div>
              )}

              <div className="mt-3 space-y-2">
                <TraceDisclosure
                  label="Prompt sent to model"
                  open={showPrompt}
                  onToggle={() => setShowPrompt((v) => !v)}
                  content={meta.prompt}
                />
                {meta.rawResponse && (
                  <TraceDisclosure
                    label="Raw model response"
                    open={showRaw}
                    onToggle={() => setShowRaw((v) => !v)}
                    content={meta.rawResponse}
                  />
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2.5 flex-wrap">
            {a.acknowledged ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-risk-low-bg)] text-[color:var(--color-risk-low)] px-3.5 py-2 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
              </span>
            ) : (
              <button
                onClick={() => acknowledge(a.id)}
                disabled={isPending}
                title={isPending ? "Run AI assessment before acknowledging" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition cursor-pointer",
                  isPending
                    ? "bg-secondary text-muted-foreground/60 cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
              </button>
            )}

            {!isPending && (
              <button
                onClick={runAssessment}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:shadow-premium transition-shadow cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3 w-3", running && "animate-spin")} /> Re-run AI
              </button>
            )}

            <Link
              to="/suppliers/$id"
              params={{ id: a.supplierId }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:shadow-premium transition-shadow cursor-pointer"
            >
              Open supplier <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceChip({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "good" ? "text-[color:var(--color-risk-low)]" :
    tone === "warn" ? "text-[color:var(--color-risk-med)]" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</div>
      <div className={cn("text-[12px] font-bold tabular-nums flex items-center gap-1", toneCls)}>
        {icon}
        {value}
      </div>
    </div>
  );
}

function TraceDisclosure({
  label,
  open,
  onToggle,
  content,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  content: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-secondary/50 transition cursor-pointer"
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words border-t border-border bg-background/60 max-h-72 overflow-auto font-mono">
          {content}
        </pre>
      )}
    </div>
  );
}
