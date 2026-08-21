import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { evidence, type Evidence } from "@/lib/db/schema";

export async function createEvidence(input: {
  agentRunId: string;
  sourceId: string;
  extractedText: string;
  claimIndices: number[];
  agentReasoning: string | null;
}): Promise<Evidence> {
  const [row] = await db.insert(evidence).values(input).returning();
  return row;
}

export async function listEvidenceForRun(runId: string): Promise<Evidence[]> {
  return db.select().from(evidence).where(eq(evidence.agentRunId, runId)).orderBy(evidence.createdAt);
}

// Evidence by id, for brief citations that belong to earlier runs than the one
// being viewed.
export async function listEvidenceByIds(ids: string[]): Promise<Evidence[]> {
  if (ids.length === 0) return [];
  return db.select().from(evidence).where(inArray(evidence.id, ids));
}
