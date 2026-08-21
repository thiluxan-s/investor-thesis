import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { HealthBar } from "@/components/agent/HealthBar";
import { HealthSplit } from "@/components/theses/HealthSplit";
import { ClaimEvidenceList } from "@/components/theses/ClaimEvidenceList";
import { rankContributions } from "@/lib/health/contribution";
import { claimHealthBreakdown } from "@/lib/health/score";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory } from "@/schemas/thesis";
import type { ClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";

export function ClaimDrilldown({
  claim,
  claimNumber,
  rows,
  runHrefBase,
}: {
  claim: Claim;
  // 1-based array position of this claim within the thesis's ordinal-ordered
  // claim list, matching the "claim N" tag used elsewhere. Deliberately NOT
  // claim.ordinal, which is gappy after a delete (deleteClaim doesn't renumber
  // survivors) — reading claim.ordinal here would reintroduce the display bug
  // that was just removed from ChallengeBrief.
  claimNumber: number;
  rows: ClaimEvidenceDetail[];
  // Path prefix for run links, without a trailing slash.
  runHrefBase: string;
}) {
  // Decay is evaluated at the instant the stored score was computed, never at
  // render time. Recomputing against `now` would drift from
  // claims.current_health_score, and the drift grows the longer a thesis sits
  // un-analyzed. Fixing the clock here makes this page reproduce the number the
  // dashboard already shows, so the contributions below sum to the bar above.
  const asOf = claim.currentHealthUpdatedAt;
  const breakdown = asOf && rows.length > 0 ? claimHealthBreakdown(rows, asOf) : null;
  const ranked = asOf && rows.length > 0 ? rankContributions(rows, asOf) : [];

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Claim {claimNumber}
        </span>
        <CategoryBadge category={claim.category as ClaimCategory} />
      </div>

      <h1 className="mt-2.5 max-w-3xl text-2xl font-semibold leading-snug tracking-tight text-zinc-900">
        {claim.statement}
      </h1>

      {breakdown ? (
        // Same 1fr/280px geometry as the thesis page this drills down from, so
        // navigating between them doesn't change the page's shape. The score
        // summary stays put while the evidence scrolls: every row states what it
        // contributed, which only means something next to the total it moved.
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          {/* The summary comes first in the DOM so a phone reads score-then-evidence;
              on desktop `order` moves it to the right rail. Unlike the thesis page,
              whose sidebar holds genuinely secondary metadata, the score here IS the
              subject — pushing it below seven evidence rows on mobile would bury it. */}
          <aside className="lg:order-2 lg:sticky lg:top-6 lg:self-start">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Claim health
            </p>
            <div className="mt-3">
              <HealthBar score={breakdown.overall} analyzed trackClassName="w-24" />
            </div>
            {asOf && <p className="mt-2 text-xs text-zinc-400">as of {formatRelativeTime(asOf)}</p>}
            <HealthSplit breakdown={breakdown} />
          </aside>

          <div className="lg:order-1">
            <ClaimEvidenceList rows={ranked} runHrefBase={runHrefBase} />
          </div>
        </div>
      ) : (
        // Flat, not carded. Two lines stating an outcome don't earn a border —
        // the same call made for NoChallengeBrief in the 7b design pass.
        <div className="mt-8 max-w-prose border-t border-zinc-100 pt-5">
          <p className="text-sm font-medium text-zinc-700">Not analyzed yet</p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
            Once the agent runs on this thesis, every piece of evidence it weighs against this claim
            appears here — with what each one contributed to the score.
          </p>
        </div>
      )}
    </div>
  );
}
