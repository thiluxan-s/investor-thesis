import Link from "next/link";
import type { ResolvedPoint } from "@/lib/agent/brief-citations";

export function ChallengeBrief({
  headline,
  summary,
  points,
  thesisId,
}: {
  headline: string;
  summary: string;
  points: ResolvedPoint[];
  thesisId: string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-[#fcfbfa] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a5a3b]">
        The case against this thesis
      </p>
      <h2 className="mt-2 text-[17px] font-semibold leading-snug tracking-tight text-zinc-900">{headline}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{summary}</p>

      <ol className="mt-4 flex flex-col gap-3.5 border-t border-zinc-200/70 pt-4">
        {points.map((point, idx) => (
          <li key={`${point.claimId}-${idx}`}>
            <p className="text-[11px] font-medium text-zinc-400">
              Claim {point.claimOrdinal + 1}
              {point.claimStatement && <span className="text-zinc-500"> · {point.claimStatement}</span>}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">{point.argument}</p>
            {point.citations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {point.citations.map((c) =>
                  c.kind === "this-run" ? (
                    <a
                      key={c.evidenceId}
                      href={`#evidence-${c.evidenceId}`}
                      className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                    >
                      {c.domain}
                    </a>
                  ) : (
                    <Link
                      key={c.evidenceId}
                      href={`/theses/${thesisId}/runs/${c.agentRunId}#evidence-${c.evidenceId}`}
                      className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                    >
                      {c.domain} <span className="font-sans text-zinc-400">· earlier run</span>
                    </Link>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// A challenge run that found nothing is a real result, not an empty state —
// the researcher prompt explicitly permits "the thesis held up" as an answer.
export function NoChallengeBrief() {
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Result</p>
      <h2 className="mt-2 text-[15px] font-semibold tracking-tight text-zinc-900">No counter-evidence found</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
        The agent looked for material that would weaken this thesis and did not find any it could stand
        behind. The thesis held up this run.
      </p>
    </section>
  );
}
