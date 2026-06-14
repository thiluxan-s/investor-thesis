import { describe, it, expect } from "vitest";
import { decayWeight, impactValue, claimHealth, thesisHealth, HALF_LIFE_DAYS } from "./score";

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
