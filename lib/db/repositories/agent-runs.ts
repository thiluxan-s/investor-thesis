import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRuns, theses, type AgentRun } from "@/lib/db/schema";
import type { AgentRunStatus, AgentRunTrigger } from "@/schemas/agent";

export async function createAgentRun(
  thesisId: string,
  trigger: AgentRunTrigger,
  digestBatchId?: string,
): Promise<AgentRun> {
  const [row] = await db
    .insert(agentRuns)
    .values({ thesisId, trigger, status: "queued", digestBatchId: digestBatchId ?? null })
    .returning();
  return row;
}

// Most recent terminal-run completion time per thesis, for "Last analyzed".
// Returns a Map of thesisId -> Date (only theses that have a completed run).
export async function lastAnalyzedByThesisIds(thesisIds: string[]): Promise<Map<string, Date>> {
  if (thesisIds.length === 0) return new Map();
  const rows = await db
    .select({ thesisId: agentRuns.thesisId, completedAt: sql<string>`max(${agentRuns.completedAt})` })
    .from(agentRuns)
    .where(inArray(agentRuns.thesisId, thesisIds))
    .groupBy(agentRuns.thesisId);
  const m = new Map<string, Date>();
  for (const r of rows) if (r.completedAt) m.set(r.thesisId, new Date(r.completedAt));
  return m;
}

export async function markRunning(runId: string): Promise<void> {
  await db.update(agentRuns).set({ status: "running", startedAt: new Date() }).where(eq(agentRuns.id, runId));
}

export async function finishRun(
  runId: string,
  status: Extract<AgentRunStatus, "complete" | "partial" | "failed">,
  opts: { error?: string } = {},
): Promise<void> {
  await db
    .update(agentRuns)
    .set({ status, completedAt: new Date(), error: opts.error ?? null })
    .where(eq(agentRuns.id, runId));
}

export async function incrementRunTotals(
  runId: string,
  totals: { inputTokens: number; outputTokens: number; iterations?: number; evidence?: number },
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      inputTokens: sql`${agentRuns.inputTokens} + ${totals.inputTokens}`,
      outputTokens: sql`${agentRuns.outputTokens} + ${totals.outputTokens}`,
      iterationsUsed: sql`${agentRuns.iterationsUsed} + ${totals.iterations ?? 0}`,
      evidenceCollected: sql`${agentRuns.evidenceCollected} + ${totals.evidence ?? 0}`,
    })
    .where(eq(agentRuns.id, runId));
}

export async function getAgentRunForUser(userId: string, runId: string): Promise<AgentRun | null> {
  const [row] = await db
    .select({ run: agentRuns })
    .from(agentRuns)
    .innerJoin(theses, eq(theses.id, agentRuns.thesisId))
    .where(and(eq(agentRuns.id, runId), eq(theses.userId, userId)))
    .limit(1);
  return row?.run ?? null;
}

export async function listAgentRunsForThesis(userId: string, thesisId: string): Promise<AgentRun[]> {
  const rows = await db
    .select({ run: agentRuns })
    .from(agentRuns)
    .innerJoin(theses, eq(theses.id, agentRuns.thesisId))
    .where(and(eq(agentRuns.thesisId, thesisId), eq(theses.userId, userId)))
    .orderBy(desc(agentRuns.createdAt));
  return rows.map((r) => r.run);
}
