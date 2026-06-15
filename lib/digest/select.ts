import type { DigestThesisInput } from "@/lib/ai/prompts/summarizer";

type ThesisLite = { id: string; title: string; ticker: string; positionDirection: "long" | "short" };

// A thesis is "changed" iff its batch run produced new evidence. (Health is only
// re-snapshotted by evaluate-run, which runs only when evidence > 0 — so a health
// delta cannot occur without new evidence.) Health before/after come from the two
// newest snapshots (newest-first input).
export function selectChangedTheses(input: {
  theses: ThesisLite[];
  evidenceByThesis: Map<string, { sourceDomain: string; extractedText: string }[]>;
  snapshotsByThesis: Map<string, { overallScore: number }[]>;
}): DigestThesisInput[] {
  const out: DigestThesisInput[] = [];
  for (const t of input.theses) {
    const evidence = input.evidenceByThesis.get(t.id) ?? [];
    if (evidence.length === 0) continue;
    const snaps = input.snapshotsByThesis.get(t.id) ?? [];
    out.push({
      thesisId: t.id,
      title: t.title,
      ticker: t.ticker,
      positionDirection: t.positionDirection,
      healthAfter: snaps[0] ? snaps[0].overallScore : null,
      healthBefore: snaps[1] ? snaps[1].overallScore : null,
      newEvidence: evidence,
    });
  }
  return out;
}
