import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { claims, thesisHealthSnapshots, type ThesisHealthSnapshot } from "@/lib/db/schema";

export type ClaimScore = { claimId: string; ordinal: number; score: number };

// All-or-nothing: update every claim's denormalized health + write one snapshot
// for the run. neon-http has no interactive transactions, so use db.batch().
export async function persistHealthForRun(input: {
  thesisId: string;
  agentRunId: string;
  recordedAt: Date;
  overallScore: number;
  claimScores: ClaimScore[];
}): Promise<void> {
  const now = new Date();
  const statements = [
    ...input.claimScores.map((cs) =>
      db
        .update(claims)
        .set({ currentHealthScore: String(cs.score), currentHealthUpdatedAt: now })
        .where(eq(claims.id, cs.claimId)),
    ),
    db
      .insert(thesisHealthSnapshots)
      .values({
        thesisId: input.thesisId,
        agentRunId: input.agentRunId,
        recordedAt: input.recordedAt,
        overallScore: String(input.overallScore),
        claimScores: input.claimScores,
      })
      .onConflictDoUpdate({
        target: thesisHealthSnapshots.agentRunId,
        set: { overallScore: String(input.overallScore), claimScores: input.claimScores, updatedAt: now },
      }),
  ];
  // claimScores is always non-empty (a thesis has 2–5 claims); db.batch needs a
  // non-empty tuple, which we assert via the param type.
  type BatchArg = Parameters<typeof db.batch>[0];
  await db.batch(statements as unknown as BatchArg);
}

export async function listSnapshotsForThesis(thesisId: string): Promise<ThesisHealthSnapshot[]> {
  return db
    .select()
    .from(thesisHealthSnapshots)
    .where(eq(thesisHealthSnapshots.thesisId, thesisId))
    .orderBy(desc(thesisHealthSnapshots.recordedAt));
}
