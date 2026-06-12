import { describe, it, expect } from "vitest";
import { canAddClaim, canDeleteClaim, MIN_CLAIMS, MAX_CLAIMS } from "./claim-invariants";

describe("claim invariants", () => {
  it("blocks adding once at the max", () => {
    expect(canAddClaim(MAX_CLAIMS - 1)).toBe(true);
    expect(canAddClaim(MAX_CLAIMS)).toBe(false);
  });
  it("blocks deleting once at the min", () => {
    expect(canDeleteClaim(MIN_CLAIMS + 1)).toBe(true);
    expect(canDeleteClaim(MIN_CLAIMS)).toBe(false);
  });
});
