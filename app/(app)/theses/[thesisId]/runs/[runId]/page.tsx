import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { getAgentRunForUser } from "@/lib/db/repositories/agent-runs";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";

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
          />
        ))}
        {iterations.length === 0 && <p className="text-sm text-zinc-400">Waiting for the agent to start…</p>}
      </div>
    </div>
  );
}
