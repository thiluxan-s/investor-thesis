import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnthropicLike } from "@/lib/ai/client";
import { DraftedClaimsSchema, type DraftedClaims } from "@/lib/ai/schemas/drafter";
import { returnDraftedClaimsTool } from "@/lib/ai/tools/return-drafted-claims";
import { systemPrompt, buildDraftingTask } from "@/lib/ai/prompts/drafter";

const tools = [
  {
    name: returnDraftedClaimsTool.name,
    description: returnDraftedClaimsTool.description,
    input_schema: z.toJSONSchema(returnDraftedClaimsTool.inputSchema) as unknown,
  },
];

export async function draftClaims(
  input: { ticker: string; positionDirection: "long" | "short"; reasoning: string },
  deps: { client: AnthropicLike },
): Promise<DraftedClaims> {
  // Default model (CURRENT_MODEL = Opus 4.8); forced tool + thinking off, like the evaluator.
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildDraftingTask(input.ticker, input.positionDirection, input.reasoning) }],
    toolChoice: { type: "tool", name: "return_drafted_claims" },
    thinking: false,
    maxTokens: 2048,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_drafted_claims",
  );
  const parsed = DraftedClaimsSchema.safeParse(toolUse?.input);
  return parsed.success ? parsed.data : { claims: [] };
}
