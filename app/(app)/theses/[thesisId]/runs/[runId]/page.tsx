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
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { listEvidenceByIds } from "@/lib/db/repositories/evidence";
import { resolveBriefCitations, type CitationSource } from "@/lib/agent/brief-citations";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";
import { ChallengeBrief, NoChallengeBrief } from "@/components/agent/trace/ChallengeBrief";
import { PersistedChallengeBriefPointsSchema } from "@/lib/ai/schemas/challenge-brief";

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
  const rawBrief = run.mode === "challenge" ? await getBriefForRun(run.id) : null;
  // points is JSONB — a row written by an older or future promptVersion could
  // be shaped differently (e.g. missing evidenceIds). Validate rather than
  // cast: a malformed brief must never 500 the app's most important screen.
  const parsedPoints = rawBrief ? PersistedChallengeBriefPointsSchema.safeParse(rawBrief.points) : null;
  const brief = parsedPoints?.success ? rawBrief : null;
  let resolvedPoints: ReturnType<typeof resolveBriefCitations> = [];
  if (brief && parsedPoints?.success) {
    const points = parsedPoints.data;
    const citedIds = [...new Set(points.flatMap((p) => p.evidenceIds))];
    const thisRunEvidenceIds = new Set(evidence.map((e) => e.id));
    const foreignIds = citedIds.filter((id) => !thisRunEvidenceIds.has(id));
    const foreignEvidence = await listEvidenceByIds(foreignIds);
    const foreignSources = await getSourcesByIds([...new Set(foreignEvidence.map((e) => e.sourceId))]);
    const foreignSourceById = new Map(foreignSources.map((s) => [s.id, s]));

    const known = new Map<string, CitationSource>();
    for (const e of evidence) {
      const src = sourcesById.get(e.sourceId);
      if (src) known.set(e.id, { evidenceId: e.id, agentRunId: e.agentRunId, title: src.title ?? src.domain, domain: src.domain });
    }
    for (const e of foreignEvidence) {
      const src = foreignSourceById.get(e.sourceId);
      if (src) known.set(e.id, { evidenceId: e.id, agentRunId: e.agentRunId, title: src.title ?? src.domain, domain: src.domain });
    }

    resolvedPoints = resolveBriefCitations(
      points,
      run.id,
      known,
      new Map(thesis.claims.map((c) => [c.id, { statement: c.statement }])),
    );
  }

  // Evidence is attached to the LAST iteration (return_result) in v1; group there.
  const lastIterId = iterations.at(-1)?.id;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/theses/${thesisId}`} className="text-xs text-zinc-400 hover:text-zinc-600">
        Theses / {thesis.ticker} / Run
      </Link>
      <RunHeader run={run} ticker={thesis.ticker} />
      {!isTerminalStatus(run.status) && <PollWhileRunning status={run.status} />}

      {run.status === "failed" && run.error && (
        <p className="mt-4 rounded-lg bg-[#fbf1ef] px-4 py-3 text-sm text-[#C0492F]">{run.error}</p>
      )}

      {brief && (
        <ChallengeBrief
          headline={brief.headline}
          summary={brief.summary}
          points={resolvedPoints}
          thesisId={thesisId}
        />
      )}
      {run.mode === "challenge" && !rawBrief && isTerminalStatus(run.status) && run.status !== "failed" && (
        <NoChallengeBrief />
      )}

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
