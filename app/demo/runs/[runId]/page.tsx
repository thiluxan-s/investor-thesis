import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoThesis, getDemoRun } from "@/lib/demo/queries";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { listLinksForEvidenceIds } from "@/lib/db/repositories/claim-evidence-links";
import { buildEvidenceVerdicts, type EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { loadTraceBrief } from "@/lib/agent/trace-brief";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";
import { ChallengeBrief, NoChallengeBrief } from "@/components/agent/trace/ChallengeBrief";

export default async function DemoTracePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const [thesis, run] = await Promise.all([getDemoThesis(), getDemoRun(runId)]);
  if (!thesis || !run) notFound();

  const [iterations, evidence] = await Promise.all([listIterations(run.id), listEvidenceForRun(run.id)]);
  const srcRows = await getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]);
  const sourcesById = new Map(srcRows.map((s) => [s.id, s]));
  const links = await listLinksForEvidenceIds(evidence.map((e) => e.id));
  const linksByEvidenceId = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByEvidenceId.get(l.evidenceId) ?? [];
    arr.push(l);
    linksByEvidenceId.set(l.evidenceId, arr);
  }
  const verdictsByEvidenceId = new Map<string, EvidenceVerdict[]>(
    evidence.map((e) => [e.id, buildEvidenceVerdicts(e.claimIndices, thesis.claims, linksByEvidenceId.get(e.id) ?? [])]),
  );
  const traceBrief =
    run.mode === "challenge"
      ? await loadTraceBrief({
          runId: run.id,
          claims: thesis.claims,
          runEvidence: evidence,
          sourcesById,
        })
      : { hasRow: false, brief: null };
  const lastIterId = iterations.at(-1)?.id;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <DemoBanner />
      <Link href="/demo" className="text-xs text-zinc-400 hover:text-zinc-600">
        ← Back to the demo thesis
      </Link>
      <RunHeader run={run} ticker={thesis.ticker} />

      {run.status === "failed" && run.error && (
        <p className="mt-4 rounded-lg bg-[#fbf1ef] px-4 py-3 text-sm text-[#C0492F]">{run.error}</p>
      )}

      {traceBrief.brief && (
        <ChallengeBrief
          headline={traceBrief.brief.headline}
          summary={traceBrief.brief.summary}
          points={traceBrief.brief.points}
          runHrefBase="/demo/runs"
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
        {iterations.length === 0 && <p className="text-sm text-zinc-400">No iterations recorded.</p>}
      </div>
      {isTerminalStatus(run.status) && run.status !== "failed" && run.evidenceCollected === 0 && (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          This run finished without finding new evidence.
        </p>
      )}
    </div>
  );
}
