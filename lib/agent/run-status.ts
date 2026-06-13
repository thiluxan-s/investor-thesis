import type { AgentRunStatus } from "@/schemas/agent";

const TERMINAL: ReadonlySet<AgentRunStatus> = new Set(["complete", "partial", "failed"]);

export function isTerminalStatus(status: AgentRunStatus): boolean {
  return TERMINAL.has(status);
}

export const STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  partial: "Partial",
  failed: "Failed",
};

// Tailwind classes per status for pills (deep-blue accent for active, calm tones otherwise).
export const STATUS_CLASS: Record<AgentRunStatus, string> = {
  queued: "bg-zinc-100 text-zinc-600",
  running: "bg-[#eef2f6] text-[#1E3A5F]",
  complete: "bg-[#eef4ef] text-[#1F7A4D]",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-[#fbf1ef] text-[#C0492F]",
};
