import "server-only";
import type { AnthropicLike } from "@/lib/ai/client";
import { writeChallengeBrief, type BriefEvidenceItem } from "@/lib/ai/agents/challenger";
import { CHALLENGER_PROMPT_VERSION } from "@/lib/ai/prompts/challenger";
import { listWeakeningLinksForThesis } from "@/lib/db/repositories/claim-evidence-links";
import { upsertBrief } from "@/lib/db/repositories/challenge-briefs";
import { selectBriefEvidence } from "@/lib/challenge/select";

// Write the case against a thesis for one challenge run. Runs AFTER evaluation
// so it can only cite evidence the evaluator independently scored as weakening.
// Idempotent: the upsert targets agentRunId.
export async function writeBriefForRun(input: {
  thesisId: string;
  agentRunId: string;
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string };
  claims: { id: string; ordinal: number; statement: string }[];
  client: AnthropicLike;
  now?: Date;
}): Promise<{ written: boolean; reason?: string }> {
  const now = input.now ?? new Date();
  const links = await listWeakeningLinksForThesis(input.thesisId);
  if (links.length === 0) return { written: false, reason: "no_weakening_evidence" };

  const selected = selectBriefEvidence(links, now);
  const items: BriefEvidenceItem[] = selected.map((s) => ({
    evidenceId: s.evidenceId,
    claimId: s.claimId,
    claimOrdinals: s.claimOrdinals,
    extractedText: s.extractedText,
    sourceDomain: s.sourceDomain,
    confidence: s.confidence,
    ageDays: s.ageDays,
  }));

  const brief = await writeChallengeBrief(input.thesis, input.claims, items, { client: input.client });
  if (!brief) return { written: false, reason: "no_citable_brief" };

  await upsertBrief({
    agentRunId: input.agentRunId,
    thesisId: input.thesisId,
    headline: brief.headline,
    summary: brief.summary,
    points: brief.points,
    promptVersion: CHALLENGER_PROMPT_VERSION,
  });
  return { written: true };
}
