import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Bell,
  SlidersHorizontal,
  Radar,
  ChevronDown,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useRisk } from "@/state/RiskContext";
import { riskLevel } from "@/data/suppliers";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/directory", label: "Suppliers", icon: Building2 },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/agent", label: "Monitoring", icon: SlidersHorizontal },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { portfolioRisk, criticalCount } = useRisk();
  const lvl = riskLevel(portfolioRisk);
  const lvlColor =
    lvl === "high" ? "text-[color:var(--color-risk-high)]" :
    lvl === "medium" ? "text-[color:var(--color-risk-med)]" :
    "text-[color:var(--color-risk-low)]";

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground sticky top-0 h-screen">
        <div className="px-6 pt-7 pb-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-sidebar-primary grid place-items-center shrink-0 transition-transform duration-300 group-hover:scale-105">
              <Radar className="h-4.5 w-4.5 text-sidebar-primary-foreground" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[17px] font-medium text-sidebar-foreground">RiskScan</div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-sidebar-foreground/50 font-semibold mt-0.5">SCMDOJO · Supply Intel</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3.5 space-y-1">
          <div className="px-3 pb-2.5 text-[9px] uppercase tracking-[0.22em] text-sidebar-foreground/40 font-bold">Workspace</div>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? path === item.to : path.startsWith(item.to) || (item.to === "/directory" && path.startsWith("/suppliers"));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] transition-all duration-200 cursor-pointer",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 font-medium",
                )}
              >
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-sidebar-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80")} strokeWidth={2} />
                <span className="flex-1">{item.label}</span>
                {item.to === "/alerts" && criticalCount > 0 && (
                  <span className="text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 grid place-items-center bg-[color:var(--color-risk-high)] text-white">
                    {criticalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Portfolio pulse card */}
        <div className="m-4 rounded-2xl bg-sidebar-accent/60 border border-sidebar-border p-4.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/50 font-bold">Portfolio Index</span>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sidebar-primary opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
            </span>
          </div>
          <div className="font-display text-4xl text-sidebar-foreground mt-2 tabular-nums">{portfolioRisk}</div>
          <p className="text-[10.5px] text-sidebar-foreground/50 mt-1.5 leading-relaxed">
            Continuous scan across 5 risk dimensions · live
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ────────────────────────────────────────── */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="flex items-center gap-4 px-5 md:px-8 h-16">
            {/* Mobile brand */}
            <Link to="/" className="md:hidden flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary grid place-items-center">
                <Radar className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.2} />
              </div>
              <span className="font-display text-[15px] font-medium">RiskScan</span>
            </Link>

            <div className="hidden lg:flex items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-risk-low-bg)] text-[color:var(--color-risk-low)] px-3 py-1 text-[10.5px] font-semibold tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />
                AGENT ACTIVE
              </span>
              <span className="h-4 w-px bg-border" />
              <span className="inline-flex items-baseline gap-1.5 text-xs">
                Portfolio risk
                <span className={cn("font-display text-lg leading-none tabular-nums", lvlColor)}>{portfolioRisk}</span>
              </span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="text-right hidden sm:block leading-tight">
                <div className="text-[13px] font-semibold">Alexandra Morgan</div>
                <div className="text-[10.5px] text-muted-foreground">Chief Procurement Officer</div>
              </div>
              <button className="flex items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2 py-1 hover:shadow-premium transition-shadow cursor-pointer">
                <div className="h-7 w-7 rounded-full bg-primary grid place-items-center text-primary-foreground text-[11px] font-semibold">
                  AM
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto">
            {nav.map((item) => {
              const active = item.exact ? path === item.to : path.startsWith(item.to) || (item.to === "/directory" && path.startsWith("/suppliers"));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs whitespace-nowrap transition",
                    active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent font-medium",
                  )}
                >
                  {item.label}
                  {item.to === "/alerts" && criticalCount > 0 && (
                    <span className={cn("text-[9px] font-bold rounded-full px-1.5 py-px", active ? "bg-white/20" : "bg-[color:var(--color-risk-high-bg)] text-[color:var(--color-risk-high)]")}>
                      {criticalCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 px-5 md:px-8 py-7 max-w-[1480px] w-full mx-auto">
          {children}
        </main>

        <footer className="px-5 md:px-8 pb-6 pt-2 max-w-[1480px] w-full mx-auto">
          <div className="text-[10px] text-muted-foreground/60 tracking-wide">
            SCMDOJO RiskScan · Autonomous supplier risk intelligence · All data refreshed continuously
          </div>
        </footer>
      </div>
    </div>
  );
}
