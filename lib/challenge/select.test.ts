import { describe, it, expect } from "vitest";
import { selectBriefEvidence, BRIEF_EVIDENCE_CAP, type WeakeningLink } from "./select";

const now = new Date("2026-08-17T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function link(over: Partial<WeakeningLink> & { evidenceId: string }): WeakeningLink {
  return {
    claimId: "claim-a",
    claimOrdinal: 0,
    confidence: 0.5,
    createdAt: daysAgo(1),
    extractedText: "text",
    ...over,
  };
}

describe("selectBriefEvidence", () => {
  it("returns an empty list for no links", () => {
    expect(selectBriefEvidence([], now)).toEqual([]);
  });

  it("orders by weight (confidence x decay), not recency", () => {
    const strongOld = link({ evidenceId: "old", confidence: 0.9, createdAt: daysAgo(30) });
    const weakNew = link({ evidenceId: "new", confidence: 0.1, createdAt: daysAgo(1) });
    const out = selectBriefEvidence([weakNew, strongOld], now);
    expect(out.map((o) => o.evidenceId)).toEqual(["old", "new"]);
  });

  it("lets heavy decay outrank raw confidence", () => {
    const staleStrong = link({ evidenceId: "stale", confidence: 0.9, createdAt: daysAgo(720) });
    const freshMid = link({ evidenceId: "fresh", confidence: 0.5, createdAt: daysAgo(1) });
    const out = selectBriefEvidence([staleStrong, freshMid], now);
    expect(out[0].evidenceId).toBe("fresh");
  });

  it("caps the result", () => {
    const many = Array.from({ length: 30 }, (_, i) => link({ evidenceId: `e${i}` }));
    expect(selectBriefEvidence(many, now)).toHaveLength(BRIEF_EVIDENCE_CAP);
    expect(selectBriefEvidence(many, now, 5)).toHaveLength(5);
  });

  it("breaks ties deterministically by evidence id", () => {
    const a = link({ evidenceId: "b-id" });
    const b = link({ evidenceId: "a-id" });
    expect(selectBriefEvidence([a, b], now).map((o) => o.evidenceId)).toEqual(["a-id", "b-id"]);
  });

  it("exposes ageDays for the prompt", () => {
    const out = selectBriefEvidence([link({ evidenceId: "e", createdAt: daysAgo(7) })], now);
    expect(out[0].ageDays).toBe(7);
  });
});
