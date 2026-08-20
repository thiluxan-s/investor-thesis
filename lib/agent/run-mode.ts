import type { AgentRunMode } from "@/schemas/agent";

export const MODE_LABEL: Record<AgentRunMode, string> = {
  research: "Research",
  challenge: "Challenge",
};

// Calm, not alarming — a challenge run is considered analysis, not a warning.
// Follows the existing restraint precedent where allow-list refusals render as
// a brick chip rather than a red alert.
export const MODE_CLASS: Record<AgentRunMode, string> = {
  research: "bg-zinc-100 text-zinc-600",
  challenge: "bg-[#f4f1ee] text-[#8a5a3b]",
};

// The trace heading names the run for what it is. A record rather than an
// inline ternary so the heading gets the same exhaustiveness the badge has.
export const MODE_HEADING: Record<AgentRunMode, string> = {
  research: "Analysis run",
  challenge: "Challenge run",
};

// Research runs are the default and carry no badge, so their traces look exactly
// as they did before this phase.
export function showsModeBadge(mode: AgentRunMode): boolean {
  return mode === "challenge";
}
