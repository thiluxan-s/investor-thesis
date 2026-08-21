import { HealthBar } from "@/components/agent/HealthBar";
import type { HealthBreakdown } from "@/lib/health/score";

// The two sub-scores are independent weighted averages over DIFFERENT
// denominators — they do not sum or average to `overall`. The sentence below is
// a binding copy constraint from the Phase 7a spec, not decoration: presenting
// these as parts of a total would be false. Never render them as a stacked bar
// or as percentages of a whole.
//
// A line of inquiry with no links renders as an absence, never as a neutral
// 0.00 — claimHealthBreakdown returns { score: 0, count: 0 } for an empty
// subset, and that zero is an implementation detail, not a finding.
//
// Stacked rather than side by side: this block sits in the drill-down's 280px
// sidebar, and two columns there would squeeze each bar to the point where the
// fill is unreadable. Stacking also keeps the two scores from reading as a
// left/right pair of a single total.
export function HealthSplit({ breakdown }: { breakdown: HealthBreakdown }) {
  return (
    <section className="mt-7 border-t border-zinc-100 pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Lines of inquiry
      </p>
      <div className="mt-3.5 flex flex-col gap-4">
        <Line
          label="Research"
          score={breakdown.research.score}
          count={breakdown.research.count}
          emptyLabel="No research runs yet"
        />
        <Line
          label="Challenge"
          score={breakdown.challenge.score}
          count={breakdown.challenge.count}
          emptyLabel="No challenge runs yet"
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        Each score is what that line of inquiry found on its own. They are separate weighted
        averages, not two halves of the overall score.
      </p>
    </section>
  );
}

function Line({
  label,
  score,
  count,
  emptyLabel,
}: {
  label: string;
  score: number;
  count: number;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-zinc-700">{label}</span>
        {count > 0 && (
          <span className="text-[11px] text-zinc-400">
            {count} {count === 1 ? "verdict" : "verdicts"}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <HealthBar
          score={score}
          analyzed={count > 0}
          trackClassName="w-24"
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  );
}
