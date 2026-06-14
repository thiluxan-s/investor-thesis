import "server-only";
import type { AnthropicLike } from "@/lib/ai/client";
import { evaluate } from "@/lib/ai/agents/evaluator";
import { EVALUATOR_PROMPT_VERSION } from "@/lib/ai/prompts/evaluator";
import { findCachedLink, upsertEvaluation, listLinksForClaim } from "@/lib/db/repositories/claim-evidence-links";
import { persistHealthForRun, type ClaimScore } from "@/lib/db/repositories/health-snapshots";
import { claimHealth, thesisHealth } from "@/lib/health/score";

export type PipelineClaim = { id: string; ordinal: number; statement: string; category: string };
export type PipelineEvidence = { id: string; extractedText: string; sourceDomain?: string };

// Evaluate every (claim, evidence) pair not already cached at the current prompt
// version. Idempotent: re-running skips pairs that already have a current verdict.
export async function evaluateMatrix(input: {
  claims: PipelineClaim[];
  evidence: PipelineEvidence[];
  client: AnthropicLike;
}): Promise<number> {
  let evaluated = 0;
  for (const claim of input.claims) {
    for (const ev of input.evidence) {
      const cached = await findCachedLink(claim.id, ev.id, EVALUATOR_PROMPT_VERSION);
      if (cached) continue;
      const verdict = await evaluate(
        { statement: claim.statement, category: claim.category },
        { extractedText: ev.extractedText, sourceDomain: ev.sourceDomain },
        { client: input.client },
      );
      await upsertEvaluation({
        claimId: claim.id,
        evidenceId: ev.id,
        impact: verdict.impact,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        evaluatorPromptVersion: EVALUATOR_PROMPT_VERSION,
      });
      evaluated++;
    }
  }
  return evaluated;
}

// Recompute each claim's health from its full link history (decayed to `now`),
// then persist claim scores + one thesis snapshot for the run.
export async function recomputeAndPersist(input: {
  thesisId: string;
  agentRunId: string;
  claims: PipelineClaim[];
  now?: Date;
}): Promise<{ overallScore: number }> {
  const now = input.now ?? new Date();
  const claimScores: ClaimScore[] = [];
  for (const claim of input.claims) {
    const links = await listLinksForClaim(claim.id);
    const score = claimHealth(
      links.map((l) => ({ impact: l.impact, confidence: Number(l.confidence), createdAt: l.createdAt })),
      now,
    );
    claimScores.push({ claimId: claim.id, ordinal: claim.ordinal, score });
  }
  const overallScore = thesisHealth(claimScores.map((c) => c.score));
  await persistHealthForRun({ thesisId: input.thesisId, agentRunId: input.agentRunId, recordedAt: now, overallScore, claimScores });
  return { overallScore };
}
