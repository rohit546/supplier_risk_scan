import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ClipboardList, ShieldCheck, CheckCheck, ArrowUpRight } from "lucide-react";
import { useRisk } from "@/state/RiskContext";
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
  const { alerts, acknowledge, acknowledgeMany } = useRisk();
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
          <p className="text-sm text-muted-foreground mt-1.5">Agent-raised flags with prescribed remediation plans</p>
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

        {filtered.map((a) => {
          const sevText =
            a.severity === "high" ? "text-[color:var(--color-risk-high)]" :
            a.severity === "medium" ? "text-[color:var(--color-risk-med)]" :
            "text-[color:var(--color-risk-low)]";
          const sevBg =
            a.severity === "high" ? "bg-[color:var(--color-risk-high-bg)]" :
            a.severity === "medium" ? "bg-[color:var(--color-risk-med-bg)]" :
            "bg-[color:var(--color-risk-low-bg)]";

          return (
            <div
              key={a.id}
              className={cn(
                "rounded-2xl border border-border bg-card p-6 shadow-premium hover-lift transition-all",
                a.acknowledged && "opacity-65",
              )}
            >
              <div className="flex items-start gap-4">
                {!a.acknowledged && (
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
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
                        <span className="ml-auto rounded-full bg-card/80 px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] text-muted-foreground">
                          {a.source === "llm" ? "AI REASONED" : "PLAYBOOK"}
                        </span>
                      </div>
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
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2.5">
                    {a.acknowledged ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-risk-low-bg)] text-[color:var(--color-risk-low)] px-3.5 py-2 text-xs font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                      </span>
                    ) : (
                      <button
                        onClick={() => acknowledge(a.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
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
        })}
      </div>
    </div>
  );
}
