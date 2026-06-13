import { describe, it, expect } from "vitest";
import { estimateRunCostUsd, formatUsd } from "./cost";

describe("estimateRunCostUsd (Opus 4.8: $5/MTok in, $25/MTok out)", () => {
  it("computes from input + output tokens", () => {
    expect(estimateRunCostUsd(1_000_000, 1_000_000)).toBeCloseTo(30, 5);
    expect(estimateRunCostUsd(0, 0)).toBe(0);
  });
  it("handles small realistic runs", () => {
    expect(estimateRunCostUsd(4500, 410)).toBeCloseTo(0.03275, 5);
  });
});

describe("formatUsd", () => {
  it("formats with a leading ~ and 2-4 dp depending on size", () => {
    expect(formatUsd(30)).toBe("~$30.00");
    expect(formatUsd(0.03275)).toBe("~$0.033");
    expect(formatUsd(0)).toBe("~$0.00");
  });
});
