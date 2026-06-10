import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  X, UserPlus, Building2, Banknote, Factory, ShieldCheck, Globe2, Leaf,
  TrendingDown, TrendingUp, Minus, AlertCircle, Loader2,
} from "lucide-react";
import { api, type NewSupplierInput } from "@/lib/api/client";
import { countryRiskFor, projectScores, COUNTRY_RISK } from "@/lib/scoreBreakdown";
import { riskColor } from "@/components/risk/RiskPrimitives";
import { riskLevel } from "@/data/suppliers";
import { cn } from "@/lib/utils";

type Better = "lower" | "higher" | "mid";
type NumKey = keyof Omit<NewSupplierInput, "name" | "country" | "region" | "category" | "tier" | "isoCertified">;

type NumField = {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string; // benchmark reference
  unit?: string;
  better: Better;
};

const COUNTRIES = Object.keys(COUNTRY_RISK).sort();

const SECTIONS: { id: string; title: string; icon: typeof Banknote; fields: NumField[] }[] = [
  {
    id: "financial",
    title: "Financial",
    icon: Banknote,
    fields: [
      { key: "creditScore", label: "Credit score", min: 300, max: 850, step: 1, hint: "Range 300–850 · ≥700 healthy", better: "higher" },
      { key: "dsoDays", label: "Days sales outstanding", min: 20, max: 120, step: 1, hint: "Benchmark 45 days", unit: "d", better: "lower" },
      { key: "debtRatio", label: "Debt ratio", min: 0.05, max: 0.95, step: 0.01, hint: "≤0.40 normal · 0.40 = 40% debt-funded", better: "lower" },
      { key: "profitMargin", label: "Profit margin", min: -0.1, max: 0.3, step: 0.01, hint: "≥0.10 healthy · 0.10 = 10%", better: "higher" },
      { key: "revenueTrend", label: "Revenue trend", min: -1, max: 1, step: 0.05, hint: "−1 shrinking … +1 growing", better: "higher" },
    ],
  },
  {
    id: "operational",
    title: "Operational",
    icon: Factory,
    fields: [
      { key: "onTimeDelivery", label: "On-time delivery", min: 60, max: 100, step: 0.1, hint: "Target ≥95%", unit: "%", better: "higher" },
      { key: "defectRate", label: "Defect rate", min: 0, max: 12, step: 0.1, hint: "SLA limit ≤2.0%", unit: "%", better: "lower" },
      { key: "capacityUtilization", label: "Capacity utilization", min: 30, max: 100, step: 1, hint: "Sweet spot 45–92%", unit: "%", better: "mid" },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    icon: ShieldCheck,
    fields: [
      { key: "certDaysToExpiry", label: "Cert days to expiry", min: -2000, max: 2000, step: 1, hint: "≥60 healthy · negative = expired", unit: "d", better: "higher" },
      { key: "violations12m", label: "Violations (12 mo)", min: 0, max: 10, step: 1, hint: "0 ideal", better: "lower" },
      { key: "lastAuditDays", label: "Last audit", min: 0, max: 2000, step: 1, hint: "≤180 days = fresh", unit: "d", better: "lower" },
    ],
  },
  {
    id: "geopolitical",
    title: "Geopolitical",
    icon: Globe2,
    fields: [
      { key: "tradeRestrictions", label: "Trade restrictions", min: 0, max: 6, step: 1, hint: "Count of tariffs / sanctions · 0 ideal", better: "lower" },
    ],
  },
  {
    id: "esg",
    title: "ESG",
    icon: Leaf,
    fields: [
      { key: "environmental", label: "Environmental", min: 0, max: 100, step: 1, hint: "0–100 · higher is better", better: "higher" },
      { key: "social", label: "Social", min: 0, max: 100, step: 1, hint: "0–100 · higher is better", better: "higher" },
      { key: "governance", label: "Governance", min: 0, max: 100, step: 1, hint: "0–100 · higher is better", better: "higher" },
      { key: "newsSentiment", label: "News sentiment", min: -1, max: 1, step: 0.05, hint: "−negative … +positive press", better: "higher" },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

// Healthy mid-tier baseline so the form opens in a valid state.
const DEFAULTS: Record<NumKey, string> = {
  creditScore: "700",
  dsoDays: "45",
  debtRatio: "0.35",
  profitMargin: "0.10",
  revenueTrend: "0.1",
  onTimeDelivery: "96",
  defectRate: "1.0",
  capacityUtilization: "80",
  certDaysToExpiry: "200",
  violations12m: "0",
  lastAuditDays: "90",
  tradeRestrictions: "0",
  environmental: "60",
  social: "65",
  governance: "68",
  newsSentiment: "0.1",
};

const DirectionIcon = ({ better }: { better: Better }) =>
  better === "higher" ? (
    <TrendingUp className="h-3 w-3" />
  ) : better === "lower" ? (
    <TrendingDown className="h-3 w-3" />
  ) : (
    <Minus className="h-3 w-3" />
  );

export function AddSupplierModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("Germany");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState(2);
  const [isoCertified, setIsoCertified] = useState(true);
  const [nums, setNums] = useState<Record<NumKey, string>>(DEFAULTS);

  const setNum = (k: NumKey, v: string) => setNums((p) => ({ ...p, [k]: v }));

  // ── Validation ─────────────────────────────────────────────
  const fieldError = (f: NumField): string | null => {
    const raw = nums[f.key];
    if (raw.trim() === "") return "Required";
    const n = Number(raw);
    if (Number.isNaN(n)) return "Not a number";
    if (n < f.min || n > f.max) return `Must be ${f.min} to ${f.max}`;
    return null;
  };

  const identityError = useMemo(() => {
    if (name.trim().length < 2) return "Supplier name is required";
    if (region.trim().length < 2) return "Region is required";
    if (category.trim().length < 2) return "Category is required";
    if (!country) return "Country is required";
    return null;
  }, [name, region, category, country]);

  const numErrors = ALL_FIELDS.filter((f) => fieldError(f) !== null).length;
  const isValid = identityError === null && numErrors === 0;

  // ── Live projected score ───────────────────────────────────
  const projection = useMemo(() => {
    const v = (k: NumKey) => Number(nums[k]);
    try {
      return projectScores({
        creditScore: v("creditScore"),
        dsoDays: v("dsoDays"),
        debtRatio: v("debtRatio"),
        profitMargin: v("profitMargin"),
        revenueTrend: v("revenueTrend"),
        onTimeDelivery: v("onTimeDelivery"),
        defectRate: v("defectRate"),
        capacityUtilization: v("capacityUtilization"),
        isoCertified,
        certDaysToExpiry: v("certDaysToExpiry"),
        violations12m: v("violations12m"),
        lastAuditDays: v("lastAuditDays"),
        countryRisk: countryRiskFor(country),
        tradeRestrictions: v("tradeRestrictions"),
        environmental: v("environmental"),
        social: v("social"),
        governance: v("governance"),
        newsSentiment: v("newsSentiment"),
      });
    } catch {
      return null;
    }
  }, [nums, isoCertified, country]);

  const projOverall = projection?.overall ?? 0;
  const projColor = riskColor(riskLevel(projOverall));
  const projLabel = riskLevel(projOverall);

  // ── Submit ─────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: api.createSupplier,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      onOpenChange(false);
      resetForm();
      void navigate({ to: "/suppliers/$id", params: { id: created.id } });
    },
  });

  const resetForm = () => {
    setName("");
    setCountry("Germany");
    setRegion("");
    setCategory("");
    setTier(2);
    setIsoCertified(true);
    setNums(DEFAULTS);
  };

  const submit = () => {
    if (!isValid) return;
    const v = (k: NumKey) => Number(nums[k]);
    const payload: NewSupplierInput = {
      name: name.trim(),
      country,
      region: region.trim(),
      category: category.trim(),
      tier,
      isoCertified,
      creditScore: v("creditScore"),
      dsoDays: v("dsoDays"),
      debtRatio: v("debtRatio"),
      profitMargin: v("profitMargin"),
      revenueTrend: v("revenueTrend"),
      onTimeDelivery: v("onTimeDelivery"),
      defectRate: v("defectRate"),
      capacityUtilization: v("capacityUtilization"),
      certDaysToExpiry: v("certDaysToExpiry"),
      violations12m: v("violations12m"),
      lastAuditDays: v("lastAuditDays"),
      tradeRestrictions: v("tradeRestrictions"),
      environmental: v("environmental"),
      social: v("social"),
      governance: v("governance"),
      newsSentiment: v("newsSentiment"),
    };
    mutation.mutate(payload);
  };

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
            "fixed left-1/2 top-1/2 z-50 w-[min(780px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
            "max-h-[90vh] overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-float",
            "flex flex-col focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {/* Header */}
          <div className="relative shrink-0 border-b border-border px-7 pt-6 pb-5 bg-gradient-to-br from-[color:var(--color-agent-bg)]/40 to-transparent">
            <div className="flex items-center gap-2 label-micro">
              <UserPlus className="h-3.5 w-3.5" /> Supplier Onboarding
            </div>
            <DialogPrimitive.Title className="font-display text-[22px] leading-tight mt-1.5">
              Add a supplier to the watchlist
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs text-muted-foreground mt-1">
              Enter raw business metrics. The engine derives the risk score live — every value is bounded to the same
              ranges as seeded suppliers.
            </DialogPrimitive.Description>

            {/* Live projected score */}
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-2.5">
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 font-display text-[22px] tabular-nums"
                style={{ color: projColor, borderColor: projColor, background: `color-mix(in oklch, ${projColor} 8%, transparent)` }}
              >
                {projOverall}
              </div>
              <div className="text-[12.5px] leading-snug">
                <span className="font-semibold text-foreground capitalize">Projected risk · {projLabel}</span>
                <div className="text-muted-foreground mt-0.5">Updates as you type. Country risk for {country}: {countryRiskFor(country)}/100.</div>
              </div>
            </div>

            <DialogPrimitive.Close className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer focus:outline-none">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-7 py-5 space-y-6">
            {/* Identity */}
            <section>
              <div className="flex items-center gap-2 label-micro mb-3">
                <Building2 className="h-3.5 w-3.5" /> Identity
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <TextField label="Supplier name" value={name} onChange={setName} placeholder="e.g. Atlas Components Ltd" error={name.trim().length > 0 && name.trim().length < 2} className="sm:col-span-2" />
                <div>
                  <FieldLabel label="Country" hint={`Sets sovereign-risk · ${countryRiskFor(country)}/100`} />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 cursor-pointer"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c} · {COUNTRY_RISK[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel label="Tier" hint="1 = most critical, 3 = least" />
                  <select
                    value={tier}
                    onChange={(e) => setTier(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 cursor-pointer"
                  >
                    <option value={1}>Tier 1 · strategic</option>
                    <option value={2}>Tier 2 · important</option>
                    <option value={3}>Tier 3 · tactical</option>
                  </select>
                </div>
                <TextField label="Region" value={region} onChange={setRegion} placeholder="e.g. EU — DACH" error={region.trim().length > 0 && region.trim().length < 2} />
                <TextField label="Category" value={category} onChange={setCategory} placeholder="e.g. Precision Components" error={category.trim().length > 0 && category.trim().length < 2} />
              </div>
            </section>

            {/* Numeric sections */}
            {SECTIONS.map((sec) => (
              <section key={sec.id}>
                <div className="flex items-center gap-2 label-micro mb-3">
                  <sec.icon className="h-3.5 w-3.5" /> {sec.title}
                  {sec.id === "geopolitical" && (
                    <span className="ml-1 text-[10px] font-medium text-muted-foreground normal-case tracking-normal">
                      · country risk set in Identity
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {sec.id === "compliance" && (
                    <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border bg-background/50 px-3.5 py-2.5">
                      <div>
                        <div className="text-[13px] font-semibold text-foreground">ISO 9001 certified</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">An expired or absent certificate is a major compliance failure.</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isoCertified}
                        onClick={() => setIsoCertified((v) => !v)}
                        className={cn(
                          "relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer",
                          isoCertified ? "bg-primary" : "bg-border",
                        )}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", isoCertified ? "left-[1.375rem]" : "left-0.5")} />
                      </button>
                    </div>
                  )}
                  {sec.fields.map((f) => (
                    <NumberField key={f.key} field={f} value={nums[f.key]} error={fieldError(f)} onChange={(v) => setNum(f.key, v)} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-7 py-4 flex items-center justify-between gap-4 bg-card">
            <div className="text-xs min-h-[1rem]">
              {mutation.isError ? (
                <span className="inline-flex items-center gap-1.5 text-[color:var(--color-risk-high)] font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> {(mutation.error as Error).message}
                </span>
              ) : identityError ? (
                <span className="text-muted-foreground">{identityError}</span>
              ) : numErrors > 0 ? (
                <span className="text-muted-foreground">{numErrors} field{numErrors > 1 ? "s" : ""} out of range</span>
              ) : (
                <span className="text-muted-foreground">Ready to onboard · projected risk {projOverall}/100</span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:shadow-premium transition-shadow cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!isValid || mutation.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2 text-xs font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                {mutation.isPending ? "Onboarding…" : "Add supplier"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FieldLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-[12px] font-semibold text-foreground">{label}</span>
      <span className="text-[10.5px] text-muted-foreground truncate">{hint}</span>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, error, className,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean; className?: string }) {
  return (
    <div className={className}>
      <FieldLabel label={label} hint="" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all",
          error ? "border-[color:var(--color-risk-high)] focus:ring-[color:var(--color-risk-high)]/20" : "border-border focus:ring-ring/25",
        )}
      />
    </div>
  );
}

function NumberField({
  field, value, error, onChange,
}: { field: NumField; value: string; error: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground">
          {field.label}
          <span className="text-muted-foreground/70" title={field.better === "mid" ? "mid-range is best" : `${field.better} is better`}>
            <DirectionIcon better={field.better} />
          </span>
        </span>
        <span className="text-[10.5px] text-muted-foreground truncate max-w-[58%]" title={field.hint}>{field.hint}</span>
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-lg border bg-card px-3 py-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 transition-all",
            field.unit ? "pr-9" : "",
            error ? "border-[color:var(--color-risk-high)] focus:ring-[color:var(--color-risk-high)]/20" : "border-border focus:ring-ring/25",
          )}
        />
        {field.unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{field.unit}</span>
        )}
      </div>
      {error && <p className="mt-1 text-[10.5px] text-[color:var(--color-risk-high)] font-medium">{error}</p>}
    </div>
  );
}
