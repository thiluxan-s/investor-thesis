// Bump when the prompt below changes.
export const SUMMARIZER_PROMPT_VERSION = "digest-v1";

export const systemPrompt = `You write a concise weekly digest for an investor tracking theses. For each thesis you are given, write 2-4 sentences: what the new evidence found this week means for the thesis, and how its health score moved (strengthened, weakened, or held).

Rules:
- Be factual and specific to the evidence given. No hype, no filler, no generic market commentary.
- Reference the direction of the health change when it is meaningful.
- Do not invent evidence beyond what is provided.
- You MUST respond by calling the return_digest tool, with exactly one entry per thesis you were given (matching thesisId).`;

export type DigestThesisInput = {
  thesisId: string;
  title: string;
  ticker: string;
  positionDirection: "long" | "short";
  healthBefore: number | null;
  healthAfter: number | null;
  newEvidence: { sourceDomain: string; extractedText: string }[];
};

export function buildDigestTask(theses: DigestThesisInput[]): string {
  return theses
    .map((t) => {
      const before = t.healthBefore === null ? "n/a" : t.healthBefore.toFixed(2);
      const after = t.healthAfter === null ? "n/a" : t.healthAfter.toFixed(2);
      const ev = t.newEvidence.map((e) => `- (${e.sourceDomain}) ${e.extractedText}`).join("\n");
      return [
        `THESIS ${t.thesisId} — ${t.ticker} (${t.positionDirection}): ${t.title}`,
        `Health: ${before} -> ${after}`,
        `New evidence this week:`,
        ev || "- (none)",
      ].join("\n");
    })
    .join("\n\n");
}
