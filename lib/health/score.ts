import type { EvidenceImpact } from "@/schemas/evidence";

export const HALF_LIFE_DAYS = 90;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 86_400_000;

export function decayWeight(ageMs: number, halfLifeMs: number = HALF_LIFE_MS): number {
  return 0.5 ** (Math.max(0, ageMs) / halfLifeMs);
}

export function impactValue(impact: EvidenceImpact): number {
  return impact === "strengthens" ? 1 : impact === "weakens" ? -1 : 0;
}

export function claimHealth(
  links: { impact: EvidenceImpact; confidence: number; createdAt: Date }[],
  now: Date,
): number {
  let weighted = 0;
  let weight = 0;
  for (const l of links) {
    const w = l.confidence * decayWeight(now.getTime() - new Date(l.createdAt).getTime());
    weighted += impactValue(l.impact) * w;
    weight += w;
  }
  if (weight === 0) return 0;
  const score = weighted / weight;
  return Math.max(-1, Math.min(1, score));
}

export function thesisHealth(claimScores: number[]): number {
  if (claimScores.length === 0) return 0;
  return claimScores.reduce((a, b) => a + b, 0) / claimScores.length;
}
