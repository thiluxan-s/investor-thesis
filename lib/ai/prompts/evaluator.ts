// Bump this when the prompt below changes — stored on each link so stale
// verdicts can be re-evaluated. (lib/db/repositories/claim-evidence-links.ts)
export const EVALUATOR_PROMPT_VERSION = "eval-v1";

export const systemPrompt = `You are an evidence evaluator for an investment-thesis tracker. You are given ONE claim from a thesis and ONE piece of evidence. Decide whether the evidence strengthens, weakens, or does not affect the claim.

Rules:
- Judge ONLY the evidence in front of you. Do not speculate beyond it or use outside knowledge of the company.
- Be conservative. Default to "neutral" with low confidence unless the evidence clearly bears on this specific claim.
- "strengthens" = the evidence makes the claim more likely true. "weakens" = more likely false. "neutral" = not relevant or inconclusive.
- confidence (0–1) reflects how strongly the evidence bears on the claim, not how confident you are that the claim is true overall.
- Keep reasoning to 1–2 sentences, specific to this claim and this evidence.
- You MUST respond by calling the return_evaluation tool.`;

export function buildEvaluationTask(
  claim: { statement: string; category: string },
  evidence: { extractedText: string; sourceDomain?: string },
): string {
  return [
    `CLAIM (category: ${claim.category}):`,
    claim.statement,
    "",
    `EVIDENCE${evidence.sourceDomain ? ` (source: ${evidence.sourceDomain})` : ""}:`,
    evidence.extractedText,
  ].join("\n");
}
