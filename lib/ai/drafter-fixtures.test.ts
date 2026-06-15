import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { DrafterFixtureReader } from "@/lib/ai/drafter-fixtures";
import { draftClaims } from "@/lib/ai/agents/drafter";

describe("drafter fixture replay", () => {
  it("draftClaims returns the recorded nvda-happy-path claims", async () => {
    const reader = new DrafterFixtureReader("nvda-happy-path");
    const client: AnthropicLike = { createMessage: async () => reader.next() as Anthropic.Message };
    const res = await draftClaims(
      { ticker: "NVDA", positionDirection: "long", reasoning: "anything at least thirty characters long here" },
      { client },
    );
    expect(res.claims).toHaveLength(3);
    expect(res.claims.map((c) => c.category)).toEqual([
      "financial_performance",
      "competitive_position",
      "macro_environment",
    ]);
    expect(res.claims[0].sourceExcerpt).toBe("data center revenue keeps climbing");
  });
});
