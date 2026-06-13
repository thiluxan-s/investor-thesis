import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRunIterations, type AgentRunIteration } from "@/lib/db/schema";

export async function appendIteration(input: {
  agentRunId: string;
  iterationNumber: number;
  requestMessages: unknown;
  responseContent: unknown;
  toolCalls: unknown;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}): Promise<void> {
  await db.insert(agentRunIterations).values(input);
}

export async function listIterations(runId: string): Promise<AgentRunIteration[]> {
  return db
    .select()
    .from(agentRunIterations)
    .where(eq(agentRunIterations.agentRunId, runId))
    .orderBy(agentRunIterations.iterationNumber);
}
