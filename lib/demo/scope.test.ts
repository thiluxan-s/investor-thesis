import { describe, it, expect } from "vitest";
import { scopeToDemo } from "./scope";
import { DEMO_THESIS_ID } from "./constants";

describe("scopeToDemo", () => {
  it("returns the row when it belongs to the demo thesis", () => {
    const row = { id: "r1", thesisId: DEMO_THESIS_ID };
    expect(scopeToDemo(row)).toBe(row);
  });
  it("returns null for a row from a different thesis", () => {
    expect(scopeToDemo({ id: "r1", thesisId: "some-other-thesis" })).toBeNull();
  });
  it("returns null for null", () => {
    expect(scopeToDemo(null)).toBeNull();
  });
});
