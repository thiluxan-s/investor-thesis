import { describe, it, expect } from "vitest";
import { buildEvidenceVerdicts } from "./evidence-verdicts";

const claims = [
  { id: "c0", statement: "Claim zero" },
  { id: "c1", statement: "Claim one" },
  { id: "c2", statement: "Claim two" },
];
const links = [
  { claimId: "c0", impact: "strengthens" as const, confidence: "0.80", reasoning: "supports" },
  { claimId: "c2", impact: "weakens" as const, confidence: "0.60", reasoning: "against" },
];

describe("buildEvidenceVerdicts", () => {
  it("maps each tagged index to its claim + link verdict", () => {
    const out = buildEvidenceVerdicts([0, 2], claims, links);
    expect(out).toEqual([
      { claimNumber: 1, statement: "Claim zero", impact: "strengthens", confidence: 0.8, reasoning: "supports" },
      { claimNumber: 3, statement: "Claim two", impact: "weakens", confidence: 0.6, reasoning: "against" },
    ]);
  });

  it("yields a pending verdict when no link exists for the claim", () => {
    const out = buildEvidenceVerdicts([1], claims, links);
    expect(out).toEqual([
      { claimNumber: 2, statement: "Claim one", impact: null, confidence: null, reasoning: null },
    ]);
  });

  it("skips indices out of range (claim deleted since the run)", () => {
    expect(buildEvidenceVerdicts([5], claims, links)).toEqual([]);
  });
});
