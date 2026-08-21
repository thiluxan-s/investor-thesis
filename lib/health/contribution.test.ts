import { describe, it, expect } from "vitest";
import { claimHealth } from "./score";
import { rankContributions } from "./contribution";
import type { EvidenceImpact } from "@/schemas/evidence";

const DAY = 86_400_000;
const now = new Date("2026-08-20T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

type L = { impact: EvidenceImpact; confidence: number; createdAt: Date; id: string };
function link(over: Partial<L> & { id: string }): L {
  return { impact: "strengthens", confidence: 0.5, createdAt: daysAgo(1), ...over };
}

const mixed: L[] = [
  link({ id: "a", impact: "strengthens", confidence: 0.9, createdAt: daysAgo(2) }),
  link({ id: "b", impact: "weakens", confidence: 0.8, createdAt: daysAgo(40) }),
  link({ id: "c", impact: "neutral", confidence: 0.7, createdAt: daysAgo(10) }),
  link({ id: "d", impact: "weakens", confidence: 0.2, createdAt: daysAgo(200) }),
];

describe("rankContributions", () => {
  it("contributions sum exactly to claimHealth over the same links", () => {
    const rows = rankContributions(mixed, now);
    const total = rows.reduce((acc, r) => acc + r.contribution, 0);
    expect(total).toBeCloseTo(claimHealth(mixed, now), 10);
  });

  it("weight shares sum to 1", () => {
    const rows = rankContributions(mixed, now);
    expect(rows.reduce((acc, r) => acc + r.weightShare, 0)).toBeCloseTo(1, 10);
  });

  it("a neutral link contributes nothing but still holds weight", () => {
    const rows = rankContributions(mixed, now);
    const neutral = rows.find((r) => r.id === "c");
    expect(neutral).toBeDefined();
    expect(neutral!.contribution).toBe(0);
    expect(neutral!.weightShare).toBeGreaterThan(0);
  });

  it("returns an empty list for no links", () => {
    expect(rankContributions([], now)).toEqual([]);
  });

  it("emits zeros rather than NaN when every confidence is zero", () => {
    const rows = rankContributions(
      [link({ id: "a", confidence: 0 }), link({ id: "b", confidence: 0 })],
      now,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(Number.isNaN(r.weightShare)).toBe(false);
      expect(Number.isNaN(r.contribution)).toBe(false);
      expect(r.weightShare).toBe(0);
      expect(r.contribution).toBe(0);
    }
  });

  it("orders by raw weight, so a heavy neutral outranks a light weakener", () => {
    const rows = rankContributions(
      [
        link({ id: "light-weakens", impact: "weakens", confidence: 0.1, createdAt: daysAgo(1) }),
        link({ id: "heavy-neutral", impact: "neutral", confidence: 0.95, createdAt: daysAgo(1) }),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["heavy-neutral", "light-weakens"]);
  });

  it("breaks an exact weight tie on createdAt (newest first), regardless of input order", () => {
    // confidence 0.5 @ age 0 and confidence 1.0 @ age 90 days both carry
    // weight 0.5 (one half-life halves decayWeight), so this is a genuine tie —
    // not just equal confidence at equal age.
    const newer = link({ id: "newer", confidence: 0.5, createdAt: daysAgo(0) });
    const older = link({ id: "older", confidence: 1.0, createdAt: daysAgo(90) });

    const fromReversed = rankContributions([older, newer], now);
    expect(fromReversed[0].weight).toBeCloseTo(fromReversed[1].weight, 10);
    expect(fromReversed.map((r) => r.id)).toEqual(["newer", "older"]);

    const fromForward = rankContributions([newer, older], now);
    expect(fromForward.map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("decays weight with age the same way the score does", () => {
    const rows = rankContributions(
      [
        link({ id: "fresh", confidence: 0.5, createdAt: daysAgo(0) }),
        link({ id: "stale", confidence: 0.5, createdAt: daysAgo(90) }),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["fresh", "stale"]);
    // One half-life at 90 days: the stale item carries half the weight.
    expect(rows[1].weight).toBeCloseTo(rows[0].weight / 2, 6);
  });
});
