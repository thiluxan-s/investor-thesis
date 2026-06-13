"use server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { createAgentRun } from "@/lib/db/repositories/agent-runs";
import { inngest } from "@/lib/inngest/client";
import type { ActionResult } from "@/app/(app)/theses/actions";

export async function triggerAgentRun(thesisId: string): Promise<ActionResult<{ agentRunId: string }>> {
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) return { ok: false, error: "Thesis not found" };
  const run = await createAgentRun(thesisId, "manual");
  // scenario makes fixture runs deterministic in dev; ignored by the real path.
  await inngest.send({
    name: "agent.run-requested",
    data: { agentRunId: run.id, thesisId, userId, scenario: "nvda-happy-path" },
  });
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: { agentRunId: run.id } };
}
