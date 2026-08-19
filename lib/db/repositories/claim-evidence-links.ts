import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { claimEvidenceLinks, claims, evidence, agentRuns, sources, type ClaimEvidenceLink } from "@/lib/db/schema";
import type { EvidenceImpact } from "@/schemas/evidence";
import type { AgentRunMode } from "@/schemas/agent";
import type { WeakeningLink } from "@/lib/challenge/select";

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

// Links for one claim, carrying the mode of the run that produced the evidence.
// Powers the per-claim health split (lib/health/score.ts claimHealthBreakdown).
export async function listLinksForClaimWithMode(
  claimId: string,
): Promise<(ClaimEvidenceLink & { runMode: AgentRunMode })[]> {
  const rows = await db
    .select({ link: claimEvidenceLinks, runMode: agentRuns.mode })
    .from(claimEvidenceLinks)
    .innerJoin(evidence, eq(claimEvidenceLinks.evidenceId, evidence.id))
    .innerJoin(agentRuns, eq(evidence.agentRunId, agentRuns.id))
    .where(eq(claimEvidenceLinks.claimId, claimId));
  return rows.map((r) => ({ ...r.link, runMode: r.runMode }));
}

// Every weakening link across a thesis's claims — the challenger's input. Scoped
// to the thesis rather than one run so the brief argues the standing case, not
// just what the latest run happened to collect.
export async function listWeakeningLinksForThesis(thesisId: string): Promise<WeakeningLink[]> {
  const rows = await db
    .select({
      evidenceId: claimEvidenceLinks.evidenceId,
      claimId: claimEvidenceLinks.claimId,
      claimOrdinal: claims.ordinal,
      confidence: claimEvidenceLinks.confidence,
      createdAt: claimEvidenceLinks.createdAt,
      extractedText: evidence.extractedText,
      sourceDomain: sources.domain,
    })
    .from(claimEvidenceLinks)
    .innerJoin(claims, eq(claimEvidenceLinks.claimId, claims.id))
    .innerJoin(evidence, eq(claimEvidenceLinks.evidenceId, evidence.id))
    .innerJoin(sources, eq(evidence.sourceId, sources.id))
    .where(and(eq(claims.thesisId, thesisId), eq(claimEvidenceLinks.impact, "weakens")));
  return rows.map((r) => ({ ...r, confidence: Number(r.confidence) }));
}
