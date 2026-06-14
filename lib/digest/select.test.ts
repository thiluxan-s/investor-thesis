import { describe, it, expect } from "vitest";
import { selectChangedTheses } from "./select";

const base = {
  theses: [
    { id: "t1", title: "Long NVDA", ticker: "NVDA", positionDirection: "long" as const },
    { id: "t2", title: "Long XAU", ticker: "XAU", positionDirection: "long" as const },
  ],
  evidenceByThesis: new Map([["t1", [{ sourceDomain: "reuters.com", extractedText: "rev up 40%" }]]]), // t2 none
  snapshotsByThesis: new Map([["t1", [{ overallScore: 0.2 }, { overallScore: 0.5 }]]]), // newest-first
};

describe("selectChangedTheses", () => {
  it("includes only theses whose batch run produced evidence", () => {
    const out = selectChangedTheses(base);
    expect(out.map((t) => t.thesisId)).toEqual(["t1"]);
  });
  it("derives healthAfter/healthBefore from the two newest snapshots", () => {
    const [t1] = selectChangedTheses(base);
    expect(t1.healthAfter).toBe(0.2);
    expect(t1.healthBefore).toBe(0.5);
    expect(t1.newEvidence).toHaveLength(1);
  });
  it("uses null health when there are no prior snapshots", () => {
    const out = selectChangedTheses({
      ...base,
      snapshotsByThesis: new Map([["t1", [{ overallScore: 0.2 }]]]),
    });
    expect(out[0].healthAfter).toBe(0.2);
    expect(out[0].healthBefore).toBeNull();
  });
});
