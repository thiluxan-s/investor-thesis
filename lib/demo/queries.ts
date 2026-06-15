import "server-only";
import { getThesisWithClaimsById } from "@/lib/db/repositories/theses";
import { getAgentRunById, listAgentRunsForThesisById } from "@/lib/db/repositories/agent-runs";
import { DEMO_THESIS_ID } from "./constants";
import { scopeToDemo } from "./scope";

export function getDemoThesis() {
  return getThesisWithClaimsById(DEMO_THESIS_ID);
}

export async function getDemoRun(runId: string) {
  return scopeToDemo(await getAgentRunById(runId));
}

export async function getDemoRuns() {
  const runs = await listAgentRunsForThesisById(DEMO_THESIS_ID);
  // Only runs that actually recorded work are inspectable; backdated snapshot
  // anchors (iterationsUsed === 0) power the chart but aren't listed.
  return runs.filter((r) => r.iterationsUsed > 0);
}
