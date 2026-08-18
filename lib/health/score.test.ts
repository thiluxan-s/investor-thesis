import { describe, it, expect } from "vitest";
import { decayWeight, impactValue, claimHealth, thesisHealth, HALF_LIFE_DAYS, claimHealthBreakdown, type ModedLink } from "./score";

const DAY = 86_400_000;

describe("decayWeight", () => {
  it("is 1 at age 0 and 0.5 at one half-life", () => {
    expect(decayWeight(0)).toBeCloseTo(1, 6);
    expect(decayWeight(HALF_LIFE_DAYS * DAY)).toBeCloseTo(0.5, 6);
  });
});

describe("impactValue", () => {
  it("maps impacts to +1 / 0 / -1", () => {
    expect(impactValue("strengthens")).toBe(1);
    expect(impactValue("neutral")).toBe(0);
    expect(impactValue("weakens")).toBe(-1);
  });
});

describe("claimHealth", () => {
  const now = new Date("2026-06-13T00:00:00Z");
  it("returns 0 when there are no links", () => {
    expect(claimHealth([], now)).toBe(0);
  });
  it("is +1 for a single full-confidence strengthens at age 0", () => {
    expect(claimHealth([{ impact: "strengthens", confidence: 1, createdAt: now }], now)).toBeCloseTo(1, 6);
  });
  it("neutral evidence pulls a strengthens toward 0", () => {
    const links = [
      { impact: "strengthens" as const, confidence: 1, createdAt: now },
      { impact: "neutral" as const, confidence: 1, createdAt: now },
    ];
    expect(claimHealth(links, now)).toBeCloseTo(0.5, 6);
  });
  it("stays within [-1, 1]", () => {
    const links = [
      { impact: "weakens" as const, confidence: 1, createdAt: now },
      { impact: "weakens" as const, confidence: 1, createdAt: now },
    ];
    expect(claimHealth(links, now)).toBeCloseTo(-1, 6);
  });
});

describe("thesisHealth", () => {
  it("is the mean of claim scores, 0 when empty", () => {
    expect(thesisHealth([])).toBe(0);
    expect(thesisHealth([1, 0, -1])).toBeCloseTo(0, 6);
    expect(thesisHealth([0.5, 0.5])).toBeCloseTo(0.5, 6);
  });
});

describe("claimHealthBreakdown", () => {
  const now = new Date("2026-08-17T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const links: ModedLink[] = [
    { impact: "strengthens", confidence: 0.8, createdAt: daysAgo(10), runMode: "research" },
    { impact: "strengthens", confidence: 0.6, createdAt: daysAgo(20), runMode: "research" },
    { impact: "weakens", confidence: 0.9, createdAt: daysAgo(5), runMode: "challenge" },
  ];

  it("overall is exactly claimHealth over all links", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.overall).toBe(claimHealth(links, now));
  });

  it("splits scores and counts by run mode", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.research.count).toBe(2);
    expect(b.challenge.count).toBe(1);
    expect(b.research.score).toBeGreaterThan(0);
    expect(b.challenge.score).toBeLessThan(0);
  });

  it("sub-scores are independent averages, not components that sum to overall", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.research.score + b.challenge.score).not.toBeCloseTo(b.overall, 5);
  });

  it("reports an absent mode as count 0 and score 0", () => {
    const researchOnly = links.filter((l) => l.runMode === "research");
    const b = claimHealthBreakdown(researchOnly, now);
    expect(b.challenge).toEqual({ score: 0, count: 0 });
    expect(b.overall).toBe(b.research.score);
  });

  it("returns all zeros for no links", () => {
    expect(claimHealthBreakdown([], now)).toEqual({
      overall: 0,
      research: { score: 0, count: 0 },
      challenge: { score: 0, count: 0 },
    });
  });

  it("decays within each subset", () => {
    const recent: ModedLink[] = [{ impact: "weakens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" }];
    const old: ModedLink[] = [{ impact: "weakens", confidence: 1, createdAt: daysAgo(400), runMode: "challenge" }];
    const mixed = [...recent, { impact: "strengthens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" } as ModedLink];
    const mixedOld = [...old, { impact: "strengthens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" } as ModedLink];
    // The old weakening item is decayed, so it drags the score down less.
    expect(claimHealthBreakdown(mixedOld, now).challenge.score).toBeGreaterThan(
      claimHealthBreakdown(mixed, now).challenge.score,
    );
  });
});
