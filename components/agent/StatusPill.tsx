import type { AgentRunStatus } from "@/schemas/agent";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/agent/run-status";

export function StatusPill({ status }: { status: AgentRunStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}
    >
      {(status === "running" || status === "queued") && (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
