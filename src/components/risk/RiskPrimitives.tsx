import { cn } from "@/lib/utils";
import { riskLevel, type RiskLevel } from "@/data/suppliers";

const styles: Record<RiskLevel, { text: string; bg: string; label: string }> = {
  low: { text: "text-[color:var(--color-risk-low)]", bg: "bg-[color:var(--color-risk-low-bg)]", label: "Low" },
  medium: { text: "text-[color:var(--color-risk-med)]", bg: "bg-[color:var(--color-risk-med-bg)]", label: "Medium" },
  high: { text: "text-[color:var(--color-risk-high)]", bg: "bg-[color:var(--color-risk-high-bg)]", label: "High" },
};

export const riskColor = (lvl: RiskLevel) =>
  lvl === "high" ? "var(--color-risk-high)" : lvl === "medium" ? "var(--color-risk-med)" : "var(--color-risk-low)";

export function RiskBadge({ score, className, showScore = true }: { score: number; className?: string; showScore?: boolean }) {
  const lvl = riskLevel(score);
  const s = styles[lvl];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[11px] font-semibold tracking-wide",
        s.text, s.bg,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
      {showScore && <span className="opacity-60 tabular-nums font-medium">{score}</span>}
    </span>
  );
}

/** Semi-circular portfolio gauge with serif numeral. */
export function RadialGauge({ value, size = 230, label = "Portfolio Risk Index" }: { value: number; size?: number; label?: string }) {
  const color = riskColor(riskLevel(value));
  const r = size / 2 - 16;
  const c = Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 30 }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path
          d={`M 16 ${size / 2} A ${r} ${r} 0 0 1 ${size - 16} ${size / 2}`}
          fill="none" stroke="var(--color-border)" strokeWidth="9" strokeLinecap="round"
        />
        <path
          d={`M 16 ${size / 2} A ${r} ${r} 0 0 1 ${size - 16} ${size / 2}`}
          fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)" }}
        />
        {/* Threshold ticks at 40 and 70 */}
        {[40, 70].map((t) => {
          const a = Math.PI - (t / 100) * Math.PI;
          const x1 = size / 2 + (r - 11) * Math.cos(a);
          const y1 = size / 2 - (r - 11) * Math.sin(a);
          const x2 = size / 2 + (r - 17) * Math.cos(a);
          const y2 = size / 2 - (r - 17) * Math.sin(a);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-muted-foreground)" strokeWidth="1.5" opacity="0.45" />;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className="font-display text-[56px] leading-none tabular-nums" style={{ color }}>{value}</div>
        <div className="label-micro mt-2">{label}</div>
      </div>
    </div>
  );
}

/** Full circular score ring for supplier detail. */
export function CircularScore({ value, size = 152, thickness = 9 }: { value: number; size?: number; thickness?: number }) {
  const color = riskColor(riskLevel(value));
  const r = size / 2 - thickness - 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={thickness} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-[42px] leading-none tabular-nums" style={{ color }}>{value}</div>
        <div className="label-micro mt-1.5">Risk Index</div>
      </div>
    </div>
  );
}

/** Inline trend sparkline with soft area fill. */
export function Sparkline({ data, width = 104, height = 30 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xy = (v: number, i: number): [number, number] => [
    (i / (data.length - 1)) * (width - 6) + 3,
    height - ((v - min) / range) * (height - 8) - 4,
  ];
  const pts = data.map((v, i) => xy(v, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const [lastX, lastY] = xy(data[data.length - 1], data.length - 1);

  const delta = data[data.length - 1] - data[0];
  const color = delta > 1 ? "var(--color-risk-high)" : delta < -1 ? "var(--color-risk-low)" : "var(--color-muted-foreground)";
  const areaPts = `3,${height - 1} ${pts} ${width - 3},${height - 1}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={areaPts} fill={color} opacity="0.07" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

/** Compact horizontal score bar for dimension breakdowns. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const color = riskColor(riskLevel(score));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-border/70 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-7 text-right" style={{ color }}>{score}</span>
    </div>
  );
}
