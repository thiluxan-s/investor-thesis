import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { claimEvidenceLinks, type ClaimEvidenceLink } from "@/lib/db/schema";
import type { EvidenceImpact } from "@/schemas/evidence";

export async function findCachedLink(
  claimId: string,
  evidenceId: string,
  promptVersion: string,
): Promise<ClaimEvidenceLink | null> {
  const [row] = await db
    .select()
    .from(claimEvidenceLinks)
    .where(
      and(
        eq(claimEvidenceLinks.claimId, claimId),
        eq(claimEvidenceLinks.evidenceId, evidenceId),
        eq(claimEvidenceLinks.evaluatorPromptVersion, promptVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertEvaluation(input: {
  claimId: string;
  evidenceId: string;
  impact: EvidenceImpact;
  confidence: number;
  reasoning: string;
  evaluatorPromptVersion: string;
}): Promise<void> {
  await db
    .insert(claimEvidenceLinks)
    .values({
      claimId: input.claimId,
      evidenceId: input.evidenceId,
      impact: input.impact,
      confidence: String(input.confidence),
      reasoning: input.reasoning,
      evaluatorPromptVersion: input.evaluatorPromptVersion,
    })
    .onConflictDoUpdate({
      target: [claimEvidenceLinks.claimId, claimEvidenceLinks.evidenceId],
      set: {
        impact: input.impact,
        confidence: String(input.confidence),
        reasoning: input.reasoning,
        evaluatorPromptVersion: input.evaluatorPromptVersion,
        updatedAt: new Date(),
      },
    });
}

export async function listLinksForClaim(claimId: string): Promise<ClaimEvidenceLink[]> {
  return db.select().from(claimEvidenceLinks).where(eq(claimEvidenceLinks.claimId, claimId));
}

export async function listLinksForEvidenceIds(evidenceIds: string[]): Promise<ClaimEvidenceLink[]> {
  if (evidenceIds.length === 0) return [];
  return db.select().from(claimEvidenceLinks).where(inArray(claimEvidenceLinks.evidenceId, evidenceIds));
}
