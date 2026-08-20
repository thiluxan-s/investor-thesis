import type { AgentRun } from "@/lib/db/schema";
import { StatusPill } from "@/components/agent/StatusPill";
import { estimateRunCostUsd, formatUsd } from "@/lib/agent/cost";
import { MODE_LABEL, MODE_CLASS, MODE_HEADING, showsModeBadge } from "@/lib/agent/run-mode";

export function RunHeader({ run, ticker }: { run: AgentRun; ticker: string }) {
  const durationS =
    run.startedAt && run.completedAt
      ? ((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1) + "s"
      : "—";
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white/90 py-4 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          {MODE_HEADING[run.mode]}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono font-semibold text-zinc-600">{ticker}</span>
          {showsModeBadge(run.mode) && (
            <span className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold ${MODE_CLASS[run.mode]}`}>
              {MODE_LABEL[run.mode]}
            </span>
          )}
          <span>
            <span className="font-mono text-zinc-700">{run.iterationsUsed}</span> iterations
          </span>
          <span>
            <span className="font-mono text-zinc-700">{run.evidenceCollected}</span> evidence
          </span>
          <span className="font-mono text-zinc-700">{formatUsd(estimateRunCostUsd(run.inputTokens, run.outputTokens))}</span>
          <span className="font-mono text-zinc-700">{durationS}</span>
        </div>
      </div>
      <StatusPill status={run.status} />
    </div>
  );
}
