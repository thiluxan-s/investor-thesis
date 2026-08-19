import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { ChallengeBriefSchema, type ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
import { returnChallengeBriefTool } from "@/lib/ai/tools/return-challenge-brief";
import { systemPrompt, buildChallengeBriefTask } from "@/lib/ai/prompts/challenger";

const tools = [
  {
    name: returnChallengeBriefTool.name,
    description: returnChallengeBriefTool.description,
    input_schema: z.toJSONSchema(returnChallengeBriefTool.inputSchema) as unknown,
  },
];

export type BriefEvidenceItem = {
  evidenceId: string;
  claimId: string;
  // Every claim this evidence weakens — one item can weaken several.
  claimOrdinals: number[];
  extractedText: string;
  sourceDomain?: string;
  confidence: number;
  ageDays: number;
};

export type ChallengeBriefResult = {
  headline: string;
  summary: string;
  points: ChallengeBriefPoint[];
};

// One-shot, no loop — same mechanical shape as the evaluator and drafter.
// Returns null when there is nothing citable to store: a malformed response, or
// a response whose points all reference claims/evidence that don't exist. A
// missing brief must never discard the evidence that has already been persisted.
export async function writeChallengeBrief(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { id: string; ordinal: number; statement: string }[],
  items: BriefEvidenceItem[],
  deps: { client: AnthropicLike },
): Promise<ChallengeBriefResult | null> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildChallengeBriefTask(thesis, claims, items) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_challenge_brief" },
    thinking: false,
    maxTokens: 2048,
  });

  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" &&
      (b as { name?: string }).name === "return_challenge_brief",
  );
  const parsed = ChallengeBriefSchema.safeParse(toolUse?.input);
  if (!parsed.success) return null;

  // Resolve model-supplied indices to ids. Out-of-range references are dropped
  // rather than fatal: a hallucinated index shouldn't void an otherwise sound brief.
  const points: ChallengeBriefPoint[] = [];
  for (const p of parsed.data.points) {
    const claim = claims[p.claim_index];
    if (!claim) continue;
    const evidenceIds = p.evidence_indices
      .map((i) => items[i]?.evidenceId)
      .filter((id): id is string => Boolean(id));
    if (evidenceIds.length === 0) continue;
    points.push({ claimId: claim.id, claimOrdinal: claim.ordinal, argument: p.argument, evidenceIds });
  }
  if (points.length === 0) return null;

  return { headline: parsed.data.headline, summary: parsed.data.summary, points };
}
