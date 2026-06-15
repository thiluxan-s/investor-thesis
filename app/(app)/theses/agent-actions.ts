"use server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { createAgentRun } from "@/lib/db/repositories/agent-runs";
import { inngest } from "@/lib/inngest/client";
import { currentWeekOf } from "@/lib/digest/week";
import type { ActionResult } from "@/app/(app)/theses/actions";
import type { Anthropic } from "@anthropic-ai/sdk";
import { DraftRequestSchema } from "@/schemas/thesis";
import { draftClaims } from "@/lib/ai/agents/drafter";
import { DrafterFixtureReader } from "@/lib/ai/drafter-fixtures";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { serverEnv } from "@/lib/env.server";
import type { DraftedClaim } from "@/lib/ai/schemas/drafter";

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

// Demo/runtime affordance: analyze ALL of the current user's active theses now
// and email the digest when they finish — same path the Sunday cron uses, scoped
// to this user. Independent of SCHEDULED_RUNS_ENABLED.
export async function triggerWeeklyDigestNow(): Promise<ActionResult> {
  const userId = await requireUserId();
  await inngest.send({
    name: "scheduled-runs.requested",
    data: { weekOf: currentWeekOf(), userId },
  });
  return { ok: true, data: undefined };
}

// Draft (not save) candidate claims from a paragraph. The wizard reviews/edits
// the result and saves through createThesis.
export async function draftClaimsFromParagraph(
  input: { ticker: string; positionDirection: "long" | "short"; reasoning: string },
): Promise<ActionResult<{ claims: DraftedClaim[] }>> {
  await requireUserId();
  const parsed = DraftRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const useFixtures = serverEnv.USE_AI_FIXTURES;
  const client: AnthropicLike = useFixtures
    ? { createMessage: async () => new DrafterFixtureReader("nvda-happy-path").next() as Anthropic.Message }
    : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
  try {
    const { claims } = await draftClaims(parsed.data, { client });
    return { ok: true, data: { claims } };
  } catch {
    return { ok: false, error: "Drafting failed — please try again." };
  }
}
