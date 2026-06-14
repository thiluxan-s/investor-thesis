import { describe, it, expect } from "vitest";
import { healthTone, formatHealthScore, healthBarFill, HEALTH_DEADBAND } from "./display";

describe("healthTone", () => {
  it("reads strong/weak outside the deadband, neutral inside", () => {
    expect(healthTone(0.5)).toBe("strong");
    expect(healthTone(-0.5)).toBe("weak");
    expect(healthTone(0)).toBe("neutral");
    expect(healthTone(HEALTH_DEADBAND)).toBe("neutral"); // boundary is inclusive-neutral
    expect(healthTone(HEALTH_DEADBAND + 0.01)).toBe("strong");
    expect(healthTone(-HEALTH_DEADBAND - 0.01)).toBe("weak");
  });
});

describe("formatHealthScore", () => {
  it("uses an explicit sign and two decimals, with a true minus glyph", () => {
    expect(formatHealthScore(0.42)).toBe("+0.42");
    expect(formatHealthScore(-0.42)).toBe("−0.42"); // U+2212
    expect(formatHealthScore(0)).toBe("0.00");
  });
  it("never renders a signed zero from rounding", () => {
    expect(formatHealthScore(-0.001)).toBe("0.00");
  });
  it("clamps to [-1, 1]", () => {
    expect(formatHealthScore(1.5)).toBe("+1.00");
    expect(formatHealthScore(-1.5)).toBe("−1.00");
  });
});

describe("healthBarFill", () => {
  it("fills right from center for positive, left for negative", () => {
    expect(healthBarFill(0)).toEqual({ leftPct: 50, widthPct: 0 });
    expect(healthBarFill(1)).toEqual({ leftPct: 50, widthPct: 50 });
    expect(healthBarFill(-1)).toEqual({ leftPct: 0, widthPct: 50 });
    expect(healthBarFill(0.5)).toEqual({ leftPct: 50, widthPct: 25 });
    expect(healthBarFill(-0.5)).toEqual({ leftPct: 25, widthPct: 25 });
  });
  it("clamps out-of-range scores", () => {
    expect(healthBarFill(2)).toEqual({ leftPct: 50, widthPct: 50 });
  });
});
