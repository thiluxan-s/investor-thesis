import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { evaluate } from "./evaluator";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({
        content: [{ type: "tool_use", name: "return_evaluation", id: "t1", input }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as unknown as Anthropic.Message,
  };
}

const claim = { statement: "Data-center revenue keeps growing", category: "growth" };
const ev = { extractedText: "Q3 data-center revenue rose 40% YoY." };

describe("evaluate", () => {
  it("returns the validated verdict from the tool call", async () => {
    const client = clientReturning({ impact: "strengthens", confidence: 0.8, reasoning: "40% growth supports it." });
    const res = await evaluate(claim, ev, { client });
    expect(res).toEqual({ impact: "strengthens", confidence: 0.8, reasoning: "40% growth supports it." });
  });

  it("falls back to neutral/0 when the tool output is malformed", async () => {
    const client = clientReturning({ impact: "boosts", confidence: 2 });
    const res = await evaluate(claim, ev, { client });
    expect(res.impact).toBe("neutral");
    expect(res.confidence).toBe(0);
    expect(res.reasoning).toMatch(/validation/i);
  });
});
