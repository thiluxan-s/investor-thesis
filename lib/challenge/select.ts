import { decayWeight } from "@/lib/health/score";

// Bounds the challenger's context. Twenty weakening items is far more than a
// 5-point brief can use, so the cap costs nothing in argument quality.
export const BRIEF_EVIDENCE_CAP = 20;

export type WeakeningLink = {
  evidenceId: string;
  claimId: string;
  claimOrdinal: number;
  confidence: number;
  createdAt: Date;
  extractedText: string;
  sourceDomain?: string;
};

export type SelectedEvidence = WeakeningLink & { weight: number; ageDays: number };

// Rank by the same weight the health score uses, so the brief argues from the
// evidence that is actually moving the number. Ties break by id to keep the
// prompt (and therefore the fixture) stable across runs.
export function selectBriefEvidence(
  links: WeakeningLink[],
  now: Date,
  cap: number = BRIEF_EVIDENCE_CAP,
): SelectedEvidence[] {
  return links
    .map((l) => {
      const ageMs = Math.max(0, now.getTime() - new Date(l.createdAt).getTime());
      return {
        ...l,
        weight: l.confidence * decayWeight(ageMs),
        ageDays: Math.floor(ageMs / 86_400_000),
      };
    })
    .sort((a, b) => b.weight - a.weight || a.evidenceId.localeCompare(b.evidenceId))
    .slice(0, cap);
}
