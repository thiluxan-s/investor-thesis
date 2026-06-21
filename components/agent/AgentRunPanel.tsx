"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentRun } from "@/lib/db/schema";
import { StatusPill } from "@/components/agent/StatusPill";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { estimateRunCostUsd, formatUsd } from "@/lib/agent/cost";

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Relative time depends on the current clock, so computing it during render
// causes a server/client hydration mismatch and freezes once a run is terminal
// (no more polling re-renders). Compute after mount and tick to keep it fresh.
function TimeAgo({ date, className }: { date: Date; className?: string }) {
  // Initializer runs at hydration with the client clock, so the mounted value is
  // already fresh; suppressHydrationWarning covers the server/client first-render
  // diff. The interval keeps it ticking after a run goes terminal.
  const [label, setLabel] = useState(() => timeAgo(date));
  useEffect(() => {
    const id = setInterval(() => setLabel(timeAgo(date)), 30_000);
    return () => clearInterval(id);
  }, [date]);
  return (
    <span suppressHydrationWarning className={className}>
      {label}
    </span>
  );
}

export function AgentRunPanel({ thesisId, runs }: { thesisId: string; runs: AgentRun[] }) {
  const latest = runs[0];
  if (!latest) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-xs text-zinc-400">
        No analysis yet
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {!isTerminalStatus(latest.status) && <PollWhileRunning status={latest.status} />}
      <Link
        href={`/theses/${thesisId}/runs/${latest.id}`}
        className="block rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50/70"
      >
        <div className="flex items-center justify-between">
          <StatusPill status={latest.status} />
          <TimeAgo date={latest.createdAt} className="text-[11px] text-zinc-400" />
        </div>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {latest.iterationsUsed} iters · {latest.evidenceCollected} evidence ·{" "}
          {formatUsd(estimateRunCostUsd(latest.inputTokens, latest.outputTokens))}
        </p>
        {latest.status === "failed" && latest.error && (
          <p className="mt-1 text-[11px] text-[#C0492F]">{latest.error}</p>
        )}
        {isTerminalStatus(latest.status) && latest.status !== "failed" && latest.evidenceCollected === 0 && (
          <p className="mt-1 text-[11px] text-zinc-400">No new evidence this run</p>
        )}
        <span className="mt-2 inline-block text-[11px] font-medium text-primary">View trace →</span>
      </Link>
      {runs.length > 1 && (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">
            {runs.length - 1} earlier {runs.length - 1 === 1 ? "run" : "runs"}
          </summary>
          <div className="mt-1 space-y-1">
            {runs.slice(1).map((r) => (
              <Link
                key={r.id}
                href={`/theses/${thesisId}/runs/${r.id}`}
                className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-zinc-50"
              >
                <StatusPill status={r.status} />
                <TimeAgo date={r.createdAt} className="text-[11px] text-zinc-400" />
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
