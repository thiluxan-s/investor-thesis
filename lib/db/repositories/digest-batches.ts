import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { digestBatches, agentRuns, type DigestBatch, type AgentRun } from "@/lib/db/schema";
import type { DigestBatchStatus } from "@/schemas/digest-batch";

// Create or reset the batch for (userId, weekOf). Re-running a week resets the
// counters so a fresh batch of runs is tracked from zero. Assumes any prior
// attempt's runs are drained before re-trigger — a still-in-flight straggler
// would increment the freshly-reset counter. Acceptable for the rare manual
// re-run (the cron fires a given week once).
export async function upsertBatch(input: {
  userId: string;
  weekOf: string;
  expectedRuns: number;
}): Promise<DigestBatch> {
  const [row] = await db
    .insert(digestBatches)
    .values({ userId: input.userId, weekOf: input.weekOf, expectedRuns: input.expectedRuns })
    .onConflictDoUpdate({
      target: [digestBatches.userId, digestBatches.weekOf],
      set: { expectedRuns: input.expectedRuns, completedRuns: 0, status: "pending", digestSentAt: null, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// Atomically count one finished run against the batch. Returns whether this
// increment completed the batch (so the caller fires the digest exactly once).
export async function recordBatchProgress(batchId: string): Promise<{ complete: boolean }> {
  const [row] = await db
    .update(digestBatches)
    .set({ completedRuns: sql`${digestBatches.completedRuns} + 1`, updatedAt: new Date() })
    .where(eq(digestBatches.id, batchId))
    .returning({ completed: digestBatches.completedRuns, expected: digestBatches.expectedRuns });
  return { complete: !!row && row.completed >= row.expected };
}

// Exactly-once claim: only the first caller flips pending -> sending. Returns
// the batch if claimed, else null (already handled).
export async function claimBatchForSend(batchId: string): Promise<DigestBatch | null> {
  const [row] = await db
    .update(digestBatches)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(digestBatches.id, batchId), eq(digestBatches.status, "pending")))
    .returning();
  return row ?? null;
}

export async function finishBatch(batchId: string, status: Extract<DigestBatchStatus, "sent" | "skipped">): Promise<void> {
  await db
    .update(digestBatches)
    .set({ status, digestSentAt: status === "sent" ? new Date() : null, updatedAt: new Date() })
    .where(eq(digestBatches.id, batchId));
}

export async function getBatch(batchId: string): Promise<DigestBatch | null> {
  const [row] = await db.select().from(digestBatches).where(eq(digestBatches.id, batchId)).limit(1);
  return row ?? null;
}

export async function listRunsForBatch(batchId: string): Promise<AgentRun[]> {
  return db.select().from(agentRuns).where(eq(agentRuns.digestBatchId, batchId));
}
