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

  it("collapses one evidence item weakening several claims into a single entry", () => {
    const out = selectBriefEvidence(
      [
        link({ evidenceId: "ev-1", claimId: "claim-c", claimOrdinal: 2, confidence: 0.3 }),
        link({ evidenceId: "ev-1", claimId: "claim-a", claimOrdinal: 0, confidence: 0.85 }),
        link({ evidenceId: "ev-1", claimId: "claim-b", claimOrdinal: 1, confidence: 0.5 }),
      ],
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0].claimOrdinals).toEqual([0, 1, 2]);
    // The strongest link decides the entry's claim and confidence.
    expect(out[0].claimId).toBe("claim-a");
    expect(out[0].confidence).toBe(0.85);
  });

  it("counts distinct evidence against the cap, not links", () => {
    const links = [
      link({ evidenceId: "ev-1", claimOrdinal: 0 }),
      link({ evidenceId: "ev-1", claimOrdinal: 1 }),
      link({ evidenceId: "ev-2", claimOrdinal: 0 }),
      link({ evidenceId: "ev-2", claimOrdinal: 1 }),
    ];
    const out = selectBriefEvidence(links, now, 2);
    expect(out.map((o) => o.evidenceId)).toEqual(["ev-1", "ev-2"]);
  });

  it("dedupes before ranking, so a weak duplicate cannot displace a strong item", () => {
    const out = selectBriefEvidence(
      [
        link({ evidenceId: "dup", claimOrdinal: 0, confidence: 0.9 }),
        link({ evidenceId: "dup", claimOrdinal: 1, confidence: 0.1 }),
        link({ evidenceId: "single", claimOrdinal: 0, confidence: 0.5 }),
      ],
      now,
      2,
    );
    expect(out.map((o) => o.evidenceId)).toEqual(["dup", "single"]);
    expect(out[0].claimOrdinals).toEqual([0, 1]);
  });
});
