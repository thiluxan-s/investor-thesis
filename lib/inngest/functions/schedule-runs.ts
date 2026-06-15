import "server-only";
import { inngest, type ScheduledRunsRequested } from "@/lib/inngest/client";
import { listUserIdsWithActiveTheses } from "@/lib/db/repositories/users";
import { listActiveThesesByUser } from "@/lib/db/repositories/theses";
import { createAgentRun } from "@/lib/db/repositories/agent-runs";
import { upsertBatch } from "@/lib/db/repositories/digest-batches";
import { serverEnv } from "@/lib/env.server";

// Schedule one user's active theses: create the sentinel batch, then a scheduled
// run per thesis carrying the batchId. Shared by the cron (all users) and the
// on-demand trigger (one user).
async function scheduleUserBatch(userId: string, weekOf: string): Promise<number> {
  const theses = await listActiveThesesByUser(userId);
  if (theses.length === 0) return 0;
  const batch = await upsertBatch({ userId, weekOf, expectedRuns: theses.length });
  // Fixtures keep scheduled dev runs deterministic & free; real path omits scenario.
  const scenario = serverEnv.USE_AI_FIXTURES ? "nvda-happy-path" : undefined;
  for (const t of theses) {
    const run = await createAgentRun(t.id, "scheduled", batch.id);
    await inngest.send({
      name: "agent.run-requested",
      data: { agentRunId: run.id, thesisId: t.id, userId, scenario, batchId: batch.id },
    });
  }
  return theses.length;
}

export const scheduleRuns = inngest.createFunction(
  { id: "schedule-runs", triggers: [{ event: "scheduled-runs.requested" }] },
  async ({ event }) => {
    const { weekOf, userId } = event.data as ScheduledRunsRequested["data"];
    const userIds = userId ? [userId] : await listUserIdsWithActiveTheses();
    let scheduled = 0;
    for (const uid of userIds) scheduled += await scheduleUserBatch(uid, weekOf);
    return { status: "scheduled" as const, users: userIds.length, runs: scheduled };
  },
);
