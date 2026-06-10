import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, ArrowUpRight, Plus } from "lucide-react";
import { useRisk } from "@/state/RiskContext";
import { RiskBadge, Sparkline } from "@/components/risk/RiskPrimitives";
import { AddSupplierModal } from "@/components/suppliers/AddSupplierModal";
import { riskLevel, type RiskLevel } from "@/data/suppliers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/directory")({
  head: () => ({ meta: [{ title: "Suppliers · SCMDOJO RiskScan" }] }),
  component: DirectoryPage,
});

function DirectoryPage() {
  const { suppliers } = useRisk();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    let list = suppliers.filter((s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) || s.country.toLowerCase().includes(q.toLowerCase()),
    );
    if (filter !== "all") list = list.filter((s) => riskLevel(s.overall) === filter);
    list.sort((a, b) => (sortDesc ? b.overall - a.overall : a.overall - b.overall));
    return list;
  }, [suppliers, q, filter, sortDesc]);

  return (
    <div className="space-y-7 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label-micro">Directory</div>
          <h1 className="font-display text-[32px] leading-tight mt-1.5 text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {suppliers.length} active entities · {new Set(suppliers.map((s) => s.region)).size} regions under watch
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search supplier or country…"
              className="pl-10 pr-4 py-2.5 text-sm rounded-full border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/25 w-64 sm:w-72 shadow-premium transition-all"
            />
          </div>
          <div className="flex items-center rounded-full border border-border bg-card p-1 shadow-premium">
            {(["all", "low", "medium", "high"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3.5 py-1.5 text-xs rounded-full capitalize transition cursor-pointer font-semibold",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition shadow-premium cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add supplier
          </button>
        </div>
      </div>

      <AddSupplierModal open={addOpen} onOpenChange={setAddOpen} />

      <div className="rounded-2xl border border-border bg-card shadow-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border bg-background/50">
                <th className="py-4 px-6 label-micro font-bold">Supplier</th>
                <th className="label-micro font-bold">Country</th>
                <th className="label-micro font-bold">Category</th>
                <th>
                  <button
                    onClick={() => setSortDesc((v) => !v)}
                    className="inline-flex items-center gap-1.5 label-micro font-bold hover:text-foreground cursor-pointer transition-colors"
                  >
                    Risk Index <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="label-micro font-bold">30d Trend</th>
                <th className="label-micro font-bold">Primary Driver</th>
                <th className="pr-6"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors group">
                  <td className="py-4 px-6">
                    <Link to="/suppliers/$id" params={{ id: s.id }} className="block cursor-pointer">
                      <div className="font-semibold text-foreground text-[14px] group-hover:text-primary transition-colors">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Tier {s.tier} · {s.region}</div>
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{s.country}</td>
                  <td className="text-muted-foreground">{s.category}</td>
                  <td><RiskBadge score={s.overall} /></td>
                  <td><Sparkline data={s.history} /></td>
                  <td className="text-muted-foreground max-w-56 truncate pr-4">{s.primaryDriver}</td>
                  <td className="text-right pr-6">
                    <Link
                      to="/suppliers/$id"
                      params={{ id: s.id }}
                      className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline cursor-pointer whitespace-nowrap"
                    >
                      View <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">
                    No suppliers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
