import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronRight, Sigma, GitBranch, Layers } from "lucide-react";
import type { SupplierDetail } from "@/data/suppliers";
import { buildScoreTree, type DimensionBreakdown } from "@/lib/scoreBreakdown";
import { riskColor } from "@/components/risk/RiskPrimitives";
import { cn } from "@/lib/utils";

export function ScoreBreakdownModal({
  supplier,
  open,
  onOpenChange,
}: {
  supplier: SupplierDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const tree = buildScoreTree(supplier);
  const overallColor = riskColor(tree.band);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-[color:var(--color-sidebar)]/40 backdrop-blur-[3px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
            "max-h-[88vh] overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-float",
            "flex flex-col focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {/* Header */}
          <div className="relative shrink-0 border-b border-border px-7 pt-6 pb-5 bg-gradient-to-br from-[color:var(--color-agent-bg)]/40 to-transparent">
            <div className="flex items-center gap-2 label-micro">
              <GitBranch className="h-3.5 w-3.5" /> Scoring Engine · Calculation Tree
            </div>
            <DialogPrimitive.Title className="font-display text-[22px] leading-tight mt-1.5">
              How {supplier.name}&rsquo;s risk score is calculated
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs text-muted-foreground mt-1">
              Every value is derived from raw metrics — nothing is hardcoded. Numbers match the live engine.
            </DialogPrimitive.Description>

            <div className="mt-4 flex items-center gap-4">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 font-display text-[28px] tabular-nums"
                style={{ color: overallColor, borderColor: overallColor, background: `color-mix(in oklch, ${overallColor} 8%, transparent)` }}
              >
                {tree.overall}
              </div>
              <div className="text-[13px] leading-relaxed text-foreground/80">
                <span className="font-semibold text-foreground">Overall risk {tree.overall}</span> — a blend of the
                weighted average across five dimensions and the single worst dimension, so one severe failure can&rsquo;t
                be averaged away.
              </div>
            </div>

            <DialogPrimitive.Close className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer focus:outline-none">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body — scrollable tree */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-7 py-5">
            {/* Overall blend node */}
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <Sigma className="h-4 w-4 text-primary" />
                <span className="text-[13px] font-semibold">Final blend</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <BlendCell label="Weighted average" value={tree.weighted} hint="all 5 dims × their weights" />
                <BlendCell label={`Worst dim · ${tree.worstLabel}`} value={tree.worst} hint="single highest score" />
                <BlendCell label="Overall (0.65 / 0.35)" value={tree.overall} hint="65% avg + 35% worst" accent />
              </div>
              <div className="mt-2.5 rounded-lg bg-secondary/60 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                {tree.blend} = <span className="font-semibold text-foreground">{tree.overall}</span>
              </div>
            </div>

            {/* Dimension branches */}
            <div className="mt-4 flex items-center gap-2 label-micro">
              <Layers className="h-3.5 w-3.5" /> Five dimension branches
            </div>
            <div className="mt-2.5 space-y-2.5">
              {tree.dimensions.map((d) => (
                <DimensionNode key={d.key} dim={d} defaultOpen={d.label === tree.worstLabel} />
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function BlendCell({ label, value, hint, accent }: { label: string; value: number; hint: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", accent ? "border-primary/30 bg-[color:var(--color-agent-bg)]/50" : "border-border bg-card")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</div>
      <div className="font-display text-2xl tabular-nums mt-0.5 text-foreground">{value}</div>
      <div className="text-[10.5px] text-muted-foreground mt-0.5 leading-tight">{hint}</div>
    </div>
  );
}

function DimensionNode({ dim, defaultOpen = false }: { dim: DimensionBreakdown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const color = riskColor(dim.band);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
      >
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0", open && "rotate-90")} />
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[13.5px] font-semibold flex-1">{dim.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">weight {dim.weightPct}%</span>
        <span className="font-display text-xl tabular-nums w-9 text-right" style={{ color }}>{dim.score}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-background/40 px-4 py-3.5 animate-rise">
          {/* sub-risk leaves */}
          <div className="space-y-2">
            {dim.subRisks.map((sr) => (
              <div key={sr.label} className="relative pl-5">
                {/* tree connector */}
                <span className="absolute left-0 top-0 bottom-0 w-px bg-border" />
                <span className="absolute left-0 top-3 h-px w-3 bg-border" />
                <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-foreground">{sr.label}</span>
                    <span className="font-mono text-[12px] tabular-nums font-semibold text-foreground shrink-0">{sr.value}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-muted-foreground">{sr.raw}</span>
                    <span className="text-muted-foreground/60">→</span>
                    <span className="rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-muted-foreground">{sr.formula}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{sr.note}</p>
                </div>
              </div>
            ))}
          </div>
          {/* combine row */}
          <div className="mt-2.5 rounded-lg bg-[color:var(--color-agent-bg)]/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Combine → {dim.label} score</div>
            <div className="font-mono text-[11.5px] text-foreground/80">
              {dim.combine} = <span className="font-semibold" style={{ color }}>{dim.score}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
