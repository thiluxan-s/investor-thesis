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

// One entry per DISTINCT evidence item. `claimOrdinals` lists every claim that
// item weakens; `claimId`/`confidence`/`weight` come from its strongest link.
export type SelectedEvidence = Omit<WeakeningLink, "claimOrdinal"> & {
  claimOrdinals: number[];
  weight: number;
  ageDays: number;
};

type WeightedLink = WeakeningLink & { weight: number; ageDays: number };

// Rank by the same weight the health score uses, so the brief argues from the
// evidence that is actually moving the number. Ties break by id to keep the
// prompt (and therefore the fixture) stable across runs.
export function selectBriefEvidence(
  links: WeakeningLink[],
  now: Date,
  cap: number = BRIEF_EVIDENCE_CAP,
): SelectedEvidence[] {
  const weighted: WeightedLink[] = links.map((l) => {
    const ageMs = Math.max(0, now.getTime() - new Date(l.createdAt).getTime());
    return {
      ...l,
      weight: l.confidence * decayWeight(ageMs),
      ageDays: Math.floor(ageMs / 86_400_000),
    };
  });

  // listWeakeningLinksForThesis returns one row per (claim, evidence) pair, so a
  // single article that weakens three claims arrives three times. Collapse to one
  // entry per distinct evidence item BEFORE capping: rendering the same passage
  // under two indices lets the model cite [0] and [3] as independent points when
  // they are one source — corroboration the evidence does not actually contain —
  // and would let duplicates eat the cap that is meant to bound distinct sources.
  const best = new Map<string, WeightedLink>();
  const ordinalsByEvidence = new Map<string, Set<number>>();
  for (const w of weighted) {
    const ordinals = ordinalsByEvidence.get(w.evidenceId) ?? new Set<number>();
    ordinals.add(w.claimOrdinal);
    ordinalsByEvidence.set(w.evidenceId, ordinals);

    // Keep the strongest link for the item; ties break by claim ordinal so the
    // surviving claimId is deterministic regardless of DB row order.
    const current = best.get(w.evidenceId);
    if (
      !current ||
      w.weight > current.weight ||
      (w.weight === current.weight && w.claimOrdinal < current.claimOrdinal)
    ) {
      best.set(w.evidenceId, w);
    }
  }

  return [...best.values()]
    .map((w) => ({
      evidenceId: w.evidenceId,
      claimId: w.claimId,
      claimOrdinals: [...(ordinalsByEvidence.get(w.evidenceId) ?? new Set<number>())].sort(
        (a, b) => a - b,
      ),
      confidence: w.confidence,
      createdAt: w.createdAt,
      extractedText: w.extractedText,
      sourceDomain: w.sourceDomain,
      weight: w.weight,
      ageDays: w.ageDays,
    }))
    .sort((a, b) => b.weight - a.weight || a.evidenceId.localeCompare(b.evidenceId))
    .slice(0, cap);
}
