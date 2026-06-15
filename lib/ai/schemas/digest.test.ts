import { describe, it, expect } from "vitest";
import { DigestSchema } from "./digest";

describe("DigestSchema", () => {
  it("accepts a valid digest", () => {
    const ok = { theses: [{ thesisId: "t1", blurb: "Revenue beat strengthens the growth claim." }] };
    expect(DigestSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects an empty blurb", () => {
    expect(DigestSchema.safeParse({ theses: [{ thesisId: "t1", blurb: "" }] }).success).toBe(false);
  });
  it("rejects a missing thesisId", () => {
    expect(DigestSchema.safeParse({ theses: [{ blurb: "x" }] }).success).toBe(false);
  });
  it("accepts an empty theses array", () => {
    expect(DigestSchema.safeParse({ theses: [] }).success).toBe(true);
  });
});
