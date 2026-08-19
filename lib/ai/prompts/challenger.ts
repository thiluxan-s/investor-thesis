// Bump when the prompt below changes — stored on each brief row so stale briefs
// are identifiable. (lib/db/repositories/challenge-briefs.ts)
export const CHALLENGER_PROMPT_VERSION = "challenge-v1";

export const systemPrompt = `You write the case AGAINST an investment thesis, for a thesis-tracking tool. The user wrote the thesis; your job is to show them, plainly, what the evidence says against it — so they can think clearly rather than only see confirmation.

You are given the thesis, its numbered claims, and a numbered list of evidence that a separate evaluator has already judged to WEAKEN one of those claims. Every item you are shown survived that independent check.

Rules:
- Argue ONLY from the numbered evidence. Do not use outside knowledge of the company, and do not speculate beyond what a passage says.
- Cite evidence indices for every point. A point with no evidence is not a point.
- At most 5 points, one per distinct line of attack. Group related items rather than repeating yourself.
- Be specific and concrete: name the number, the quarter, the competitor, the filing. Vague pessimism is worthless.
- Stay descriptive. Do NOT recommend buying, selling, holding, or resizing a position. Do NOT estimate a probability that the thesis is wrong. You describe the case against; the user decides what to do about it.
- If the evidence is thin, say so plainly in the summary rather than inflating it.
- The headline is one line naming the strongest single problem. The summary is 2-4 sentences.
- You MUST respond by calling the return_challenge_brief tool.`;

export function buildChallengeBriefTask(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { ordinal: number; statement: string }[],
  items: { extractedText: string; sourceDomain?: string; claimOrdinals: number[]; confidence: number; ageDays: number }[],
): string {
  const claimList = claims.map((c, i) => `${i}. ${c.statement}`).join("\n");
  // Evidence carries the claims' raw ordinals, but the claim list above is numbered by
  // array position — the two diverge once a claim has been deleted (deleteClaim does
  // not renumber survivors). Look up the list position so "weakens claim N" always
  // points at a claim that actually appears at index N above; drop any ordinal that
  // doesn't resolve rather than print a stale one, and omit the whole segment if none
  // of an item's ordinals resolve.
  const positionByOrdinal = new Map(claims.map((c, i) => [c.ordinal, i]));
  const evidenceList = items
    .map((it, i) => {
      const positions = it.claimOrdinals
        .map((o) => positionByOrdinal.get(o))
        .filter((p): p is number => p !== undefined)
        .sort((a, b) => a - b);
      const segments = [
        ...(positions.length
          ? [`weakens claim${positions.length > 1 ? "s" : ""} ${positions.join(", ")}`]
          : []),
        `confidence ${it.confidence.toFixed(2)}`,
        `${it.ageDays} days old`,
        ...(it.sourceDomain ? [`source: ${it.sourceDomain}`] : []),
      ];
      return `[${i}] ${segments.join(" | ")}\n${it.extractedText}`;
    })
    .join("\n\n");
  return `Thesis: ${thesis.title}
Ticker: ${thesis.ticker} | Position: ${thesis.positionDirection} | Horizon: ${thesis.timeHorizon}

Claims (zero-based — use these indices in claim_index):
${claimList}

Evidence judged to weaken these claims (zero-based — use these indices in evidence_indices):
${evidenceList}

Write the case against this thesis, then call return_challenge_brief.`;
}
