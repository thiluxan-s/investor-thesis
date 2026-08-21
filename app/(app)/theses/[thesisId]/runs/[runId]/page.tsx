import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { getAgentRunForUser } from "@/lib/db/repositories/agent-runs";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { listLinksForEvidenceIds } from "@/lib/db/repositories/claim-evidence-links";
import { buildEvidenceVerdicts, type EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { loadTraceBrief } from "@/lib/agent/trace-brief";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";
import { ChallengeBrief, NoChallengeBrief } from "@/components/agent/trace/ChallengeBrief";

export default async function TracePage({
  params,
}: {
  params: Promise<{ thesisId: string; runId: string }>;
}) {
  const { thesisId, runId } = await params;
  const userId = await requireUserId();
  const [thesis, run] = await Promise.all([getThesisForUser(userId, thesisId), getAgentRunForUser(userId, runId)]);
  if (!thesis || !run || run.thesisId !== thesisId) notFound();

  const [iterations, evidence] = await Promise.all([listIterations(run.id), listEvidenceForRun(run.id)]);
  const srcRows = await getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]);
  const sourcesById = new Map(srcRows.map((s) => [s.id, s]));

  // Evaluator verdicts for this run's evidence, mapped to the researcher's
  // claim tags. thesis.claims is ordered by ordinal (getThesisForUser), matching
  // the positional claimIndices the researcher recorded.
  const links = await listLinksForEvidenceIds(evidence.map((e) => e.id));
  const linksByEvidenceId = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByEvidenceId.get(l.evidenceId) ?? [];
    arr.push(l);
    linksByEvidenceId.set(l.evidenceId, arr);
  }
  const verdictsByEvidenceId = new Map<string, EvidenceVerdict[]>(
    evidence.map((e) => [
      e.id,
      buildEvidenceVerdicts(e.claimIndices, thesis.claims, linksByEvidenceId.get(e.id) ?? []),
    ]),
  );

  // Challenge runs carry a brief. Its citations point at the thesis's standing
  // weakening evidence, so some may belong to earlier runs and have no card here.
  const traceBrief =
    run.mode === "challenge"
      ? await loadTraceBrief({
          runId: run.id,
          claims: thesis.claims,
          runEvidence: evidence,
          sourcesById,
        })
      : { hasRow: false, brief: null };

  // Evidence is attached to the LAST iteration (return_result) in v1; group there.
  const lastIterId = iterations.at(-1)?.id;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Segmented to match the claim drill-down — two adjacent three-level
          trails behaving differently is worse than either choice alone. */}
      <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Link href="/theses" className="hover:text-zinc-600">
          Theses
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/theses/${thesisId}`} className="hover:text-zinc-600">
          {thesis.ticker}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-500">Run</span>
      </nav>
      <RunHeader run={run} ticker={thesis.ticker} />
      {!isTerminalStatus(run.status) && <PollWhileRunning status={run.status} />}

      {run.status === "failed" && run.error && (
        <p className="mt-4 rounded-lg bg-[#fbf1ef] px-4 py-3 text-sm text-[#C0492F]">{run.error}</p>
      )}

      {traceBrief.brief && (
        <ChallengeBrief
          headline={traceBrief.brief.headline}
          summary={traceBrief.brief.summary}
          points={traceBrief.brief.points}
          runHrefBase={`/theses/${thesisId}/runs`}
        />
      )}
      {run.mode === "challenge" &&
        !traceBrief.hasRow &&
        isTerminalStatus(run.status) &&
        run.status !== "failed" && <NoChallengeBrief />}

      <div className="relative mt-6 pl-[30px]">
        <span className="absolute bottom-4 left-[9px] top-1.5 w-0.5 bg-zinc-200" aria-hidden />
        {iterations.map((it, idx) => (
          <IterationCard
            key={it.id}
            iteration={it}
            index={idx}
            active={!isTerminalStatus(run.status) && idx === iterations.length - 1}
            evidence={it.id === lastIterId ? evidence : []}
            sourcesById={sourcesById}
            verdictsByEvidenceId={verdictsByEvidenceId}
          />
        ))}
        {iterations.length === 0 && <p className="text-sm text-zinc-400">Waiting for the agent to start…</p>}
      </div>
      {isTerminalStatus(run.status) && run.status !== "failed" && run.evidenceCollected === 0 && (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          This run finished without finding new evidence.
        </p>
      )}
    </div>
  );
}
