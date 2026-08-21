import { describe, it, expect } from "vitest";
import { ChallengeBriefSchema, PersistedChallengeBriefPointsSchema } from "./challenge-brief";

const valid = {
  headline: "Margin pressure is showing up before the revenue slowdown",
  summary: "Two independent sources report gross-margin compression this quarter.",
  points: [{ claim_index: 0, argument: "Gross margin fell 200bps QoQ.", evidence_indices: [0, 1] }],
};

describe("ChallengeBriefSchema", () => {
  it("accepts a well-formed brief", () => {
    expect(ChallengeBriefSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a brief with no points (caller treats it as no brief)", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, points: [] }).success).toBe(true);
  });

  it("rejects a negative claim index", () => {
    const bad = { ...valid, points: [{ ...valid.points[0], claim_index: -1 }] };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer evidence index", () => {
    const bad = { ...valid, points: [{ ...valid.points[0], evidence_indices: [1.5] }] };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an over-long headline", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, headline: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects more than five points", () => {
    const bad = { ...valid, points: Array.from({ length: 6 }, () => valid.points[0]) };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });
});

describe("PersistedChallengeBriefPointsSchema", () => {
  const validPoint = {
    claimId: "11111111-1111-1111-1111-111111111111",
    claimOrdinal: 0,
    argument: "Gross margin fell 200bps QoQ.",
    evidenceIds: ["22222222-2222-2222-2222-222222222222"],
  };

  it("accepts a valid persisted point array", () => {
    expect(PersistedChallengeBriefPointsSchema.safeParse([validPoint]).success).toBe(true);
  });

  it("accepts an empty array", () => {
    expect(PersistedChallengeBriefPointsSchema.safeParse([]).success).toBe(true);
  });

  it("rejects a point missing evidenceIds (e.g. an older or future promptVersion's shape)", () => {
    const { evidenceIds: _evidenceIds, ...withoutEvidenceIds } = validPoint;
    expect(PersistedChallengeBriefPointsSchema.safeParse([withoutEvidenceIds]).success).toBe(false);
  });
});
