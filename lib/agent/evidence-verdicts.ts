import type { EvidenceImpact } from "@/schemas/evidence";

export type EvidenceVerdict = {
  // 1-based display number (index + 1), matching the existing "claim N" tag.
  claimNumber: number;
  statement: string;
  // null when the (claim, evidence) pair has no link yet (pending / not evaluated).
  impact: EvidenceImpact | null;
  confidence: number | null;
  reasoning: string | null;
};

// `claimIndices` are positions into `claims` (ordered by ordinal, as the
// researcher saw them). `links` are this evidence's claim_evidence_links.
export function buildEvidenceVerdicts(
  claimIndices: number[],
  claims: { id: string; statement: string }[],
  links: { claimId: string; impact: EvidenceImpact; confidence: string; reasoning: string }[],
): EvidenceVerdict[] {
  const linkByClaimId = new Map(links.map((l) => [l.claimId, l]));
  const verdicts: EvidenceVerdict[] = [];
  for (const idx of claimIndices) {
    const claim = claims[idx];
    if (!claim) continue; // claim deleted since the run
    const link = linkByClaimId.get(claim.id);
    verdicts.push({
      claimNumber: idx + 1,
      statement: claim.statement,
      impact: link ? link.impact : null,
      confidence: link ? Number(link.confidence) : null,
      reasoning: link ? link.reasoning : null,
    });
  }
  return verdicts;
}
