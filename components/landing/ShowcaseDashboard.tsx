import { HealthBar } from "@/components/agent/HealthBar";
import { HealthChart } from "@/components/theses/HealthChart";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { DASHBOARD_SHOWCASE } from "./showcase-data";

export function ShowcaseDashboard() {
  const d = DASHBOARD_SHOWCASE;
  return (
    <div className="text-left">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
          {d.ticker} · {d.direction}
        </span>
        <span className="font-mono text-xs text-zinc-400">{d.horizon}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-900">{d.title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400">Overall health</span>
        <HealthBar score={d.overallScore} analyzed trackClassName="w-24" />
      </div>

      <div className="mt-4 space-y-3">
        {d.claims.map((c) => (
          <div key={c.statement}>
            <div className="flex items-center justify-between gap-2">
              <CategoryBadge category={c.category} />
              <HealthBar score={c.score} analyzed trackClassName="w-16" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{c.statement}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <HealthChart points={d.trend} />
      </div>
    </div>
  );
}
