import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { HealthBar } from "@/components/agent/HealthBar";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory } from "@/schemas/thesis";

export function DemoClaimList({ claims }: { claims: Claim[] }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Claims · {claims.length}</p>
      {claims.map((c, idx) => (
        <div key={c.id} className="border-b border-zinc-100 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-zinc-400">{idx + 1}</span>
              <CategoryBadge category={c.category as ClaimCategory} />
            </div>
            <HealthBar
              score={Number(c.currentHealthScore)}
              analyzed={c.currentHealthUpdatedAt !== null}
              trackClassName="w-20"
            />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
        </div>
      ))}
    </div>
  );
}
