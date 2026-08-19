import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { challengeBriefs, type ChallengeBrief } from "@/lib/db/schema";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";

// Upsert on agentRunId so an Inngest step re-delivery rewrites one row.
export async function upsertBrief(input: {
  agentRunId: string;
  thesisId: string;
  headline: string;
  summary: string;
  points: ChallengeBriefPoint[];
  promptVersion: string;
}): Promise<void> {
  await db
    .insert(challengeBriefs)
    .values(input)
    .onConflictDoUpdate({
      target: challengeBriefs.agentRunId,
      set: {
        headline: input.headline,
        summary: input.summary,
        points: input.points,
        promptVersion: input.promptVersion,
        updatedAt: new Date(),
      },
    });
}

export async function getBriefForRun(agentRunId: string): Promise<ChallengeBrief | null> {
  const [row] = await db
    .select()
    .from(challengeBriefs)
    .where(eq(challengeBriefs.agentRunId, agentRunId))
    .limit(1);
  return row ?? null;
}

export async function getLatestBriefForThesis(thesisId: string): Promise<ChallengeBrief | null> {
  const [row] = await db
    .select()
    .from(challengeBriefs)
    .where(eq(challengeBriefs.thesisId, thesisId))
    .orderBy(desc(challengeBriefs.createdAt))
    .limit(1);
  return row ?? null;
}
