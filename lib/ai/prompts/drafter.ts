export const DRAFTER_PROMPT_VERSION = "drafter-v1";

export const systemPrompt = `You structure an investor's own reasoning into claims. Given a ticker, a position direction, and a free-text paragraph, extract the distinct claims the investor is making — each a single, falsifiable statement an analyst could later seek evidence for.

Rules:
- Extract 2 to 7 claims. Use the investor's OWN words and meaning — rephrase only enough to make each a standalone, falsifiable statement.
- Do NOT introduce reasoning, facts, or claims the investor did not express. Do NOT judge whether any claim is true. You are structuring, not advising.
- Assign each claim the single best-fitting category.
- Set sourceExcerpt to the verbatim substring of the paragraph the claim is drawn from (copy it exactly; use "" only if no single span fits).
- If the paragraph is too vague to yield even two distinct claims, return fewer (or none) rather than inventing them.
- You MUST respond by calling the return_drafted_claims tool.`;

export function buildDraftingTask(
  ticker: string,
  positionDirection: "long" | "short",
  reasoning: string,
): string {
  return [
    `TICKER: ${ticker}`,
    `POSITION: ${positionDirection}`,
    "",
    "INVESTOR'S REASONING:",
    reasoning,
  ].join("\n");
}
