import { describe, it, expect } from "vitest";
import { DraftedClaimsSchema } from "./drafter";

describe("DraftedClaimsSchema", () => {
  it("accepts valid drafted claims", () => {
    const ok = { claims: [{ statement: "Data-center revenue keeps growing", category: "financial_performance", sourceExcerpt: "revenue keeps growing" }] };
    expect(DraftedClaimsSchema.safeParse(ok).success).toBe(true);
  });
  it("accepts an empty claims array", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [] }).success).toBe(true);
  });
  it("allows an empty sourceExcerpt", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ statement: "x", category: "other", sourceExcerpt: "" }] }).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ statement: "x", category: "vibes", sourceExcerpt: "" }] }).success).toBe(false);
  });
  it("rejects a missing statement", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ category: "other", sourceExcerpt: "" }] }).success).toBe(false);
  });
});
