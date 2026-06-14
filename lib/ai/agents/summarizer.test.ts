import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { summarize } from "./summarizer";
import type { DigestThesisInput } from "@/lib/ai/prompts/summarizer";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({ content: [{ type: "tool_use", name: "return_digest", id: "d1", input }], usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Anthropic.Message,
  };
}

const theses: DigestThesisInput[] = [
  { thesisId: "t1", title: "Long NVDA", ticker: "NVDA", positionDirection: "long", healthBefore: 0.5, healthAfter: 0.2, newEvidence: [{ sourceDomain: "reuters.com", extractedText: "rev up 40%" }] },
];

describe("summarize", () => {
  it("returns the validated digest from the tool call", async () => {
    const client = clientReturning({ theses: [{ thesisId: "t1", blurb: "Growth held but momentum cooled." }] });
    const res = await summarize(theses, { client });
    expect(res.theses).toEqual([{ thesisId: "t1", blurb: "Growth held but momentum cooled." }]);
  });
  it("returns an empty digest when the tool output is malformed", async () => {
    const client = clientReturning({ nope: true });
    const res = await summarize(theses, { client });
    expect(res.theses).toEqual([]);
  });
});
