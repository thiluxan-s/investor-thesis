import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { DigestSchema, type DigestResult } from "@/lib/ai/schemas/digest";
import { returnDigestTool } from "@/lib/ai/tools/return-digest";
import { systemPrompt, buildDigestTask, type DigestThesisInput } from "@/lib/ai/prompts/summarizer";

const tools = [
  {
    name: returnDigestTool.name,
    description: returnDigestTool.description,
    input_schema: z.toJSONSchema(returnDigestTool.inputSchema) as unknown,
  },
];

export async function summarize(
  theses: DigestThesisInput[],
  deps: { client: AnthropicLike },
): Promise<DigestResult> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildDigestTask(theses) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_digest" },
    thinking: false,
    maxTokens: 2048,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_digest",
  );
  const parsed = DigestSchema.safeParse(toolUse?.input);
  return parsed.success ? parsed.data : { theses: [] };
}
