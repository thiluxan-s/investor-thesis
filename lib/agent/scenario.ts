import type { AgentRunMode } from "@/schemas/agent";

// Fixture scenario per run mode. Under USE_AI_FIXTURES a challenge run carrying
// the research scenario replays research messages through the challenge loop —
// it doesn't crash, it just quietly isn't a challenge run.
export const RESEARCH_SCENARIO = "nvda-happy-path";
export const CHALLENGE_SCENARIO = "nvda-challenge";

export function scenarioForMode(mode: AgentRunMode): string {
  return mode === "challenge" ? CHALLENGE_SCENARIO : RESEARCH_SCENARIO;
}
