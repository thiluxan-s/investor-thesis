import Link from "next/link";
import { IMPACT_STYLE, formatHealthScore } from "@/lib/health/display";
import { MODE_LABEL } from "@/lib/agent/run-mode";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { Weighted } from "@/lib/health/contribution";
import type { ClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";

// Rows arrive already ranked by weight (see rankContributions) — do not re-sort
// here. Each row shows both its signed contribution and its share of total
// weight: a `neutral` verdict contributes 0.00 while still holding weight, and
// that dilution is the answer to "why isn't this score more extreme".
export function ClaimEvidenceList({
  rows,
  runHrefBase,
}: {
  rows: Weighted<ClaimEvidenceDetail>[];
  runHrefBase: string;
}) {
  return (
    <section>
      {/* The section is titled "Evidence", so a counted noun ("7 items") only
          repeats the heading. HealthSplit's "7 verdicts" keeps its noun because
          there it disambiguates what is being counted within a line of inquiry. */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Evidence · {rows.length}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Ordered by the weight each item carries in the score.
      </p>
      <ol className="mt-4">
        {rows.map((r) => {
          const style = IMPACT_STYLE[r.impact];
          return (
            <li
              key={r.evidenceId}
              className="border-t border-zinc-100 py-4 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {r.sourceTitle && <span className="text-zinc-500">{r.sourceTitle}</span>}
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                >
                  {r.sourceDomain}
                </a>
                <span className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                  <span className={`font-medium ${style.text}`}>{style.label}</span>
                </span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {r.confidence.toFixed(2)} confidence
                </span>
                <span className="text-zinc-400">{formatRelativeTime(r.createdAt)}</span>
                <Link
                  href={`${runHrefBase}/${r.agentRunId}#evidence-${r.evidenceId}`}
                  className="ml-auto text-zinc-400 underline decoration-zinc-200 underline-offset-2 hover:text-zinc-700"
                >
                  {MODE_LABEL[r.runMode]} run →
                </Link>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-zinc-800">{r.extractedText}</p>
              <p className="mt-2 max-w-prose text-xs leading-relaxed text-zinc-500">{r.reasoning}</p>

              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
                <span className={`font-mono font-medium tabular-nums ${style.text}`}>
                  {formatHealthScore(r.contribution)} contribution
                </span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {/* A present row can still round to 0% at 2 significant figures of
                      share; that reads as self-contradicting next to "dilutes toward
                      zero" for a neutral verdict, so any non-zero share under 0.5%
                      shows as <1% and only a genuinely zero share shows as 0%. */}
                  {r.weightShare === 0
                    ? "0%"
                    : r.weightShare < 0.005
                      ? "<1%"
                      : `${Math.round(r.weightShare * 100)}%`}{" "}
                  of weight
                </span>
                {r.impact === "neutral" && r.weightShare > 0 && (
                  <span className="text-zinc-400">dilutes toward zero</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
