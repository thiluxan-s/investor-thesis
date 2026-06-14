import { describe, it, expect } from "vitest";
import { EvaluationSchema } from "./evaluation";

describe("EvaluationSchema", () => {
  it("accepts a valid verdict", () => {
    const ok = { impact: "strengthens", confidence: 0.8, reasoning: "Revenue beat confirms demand." };
    expect(EvaluationSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects confidence out of range", () => {
    expect(EvaluationSchema.safeParse({ impact: "neutral", confidence: 1.5, reasoning: "x" }).success).toBe(false);
  });
  it("rejects an unknown impact", () => {
    expect(EvaluationSchema.safeParse({ impact: "boosts", confidence: 0.5, reasoning: "x" }).success).toBe(false);
  });
  it("rejects empty reasoning", () => {
    expect(EvaluationSchema.safeParse({ impact: "weakens", confidence: 0.5, reasoning: "" }).success).toBe(false);
  });
});
