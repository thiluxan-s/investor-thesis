import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { draftClaims } from "./drafter";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({ content: [{ type: "tool_use", name: "return_drafted_claims", id: "d1", input }], usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Anthropic.Message,
  };
}

const input = { ticker: "NVDA", positionDirection: "long" as const, reasoning: "Data center demand keeps growing and margins are strong." };

describe("draftClaims", () => {
  it("returns the validated claims from the tool call", async () => {
    const client = clientReturning({ claims: [{ statement: "Data-center demand keeps growing", category: "financial_performance", sourceExcerpt: "Data center demand keeps growing" }] });
    const res = await draftClaims(input, { client });
    expect(res.claims).toHaveLength(1);
    expect(res.claims[0].category).toBe("financial_performance");
  });
  it("returns empty claims when the tool output is malformed", async () => {
    const client = clientReturning({ claims: [{ statement: "x", category: "not-a-category", sourceExcerpt: "" }] });
    const res = await draftClaims(input, { client });
    expect(res.claims).toEqual([]);
  });
});
