import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { EvaluationSchema, type EvaluationResult } from "@/lib/ai/schemas/evaluation";
import { returnEvaluationTool } from "@/lib/ai/tools/return-evaluation";
import { systemPrompt, buildEvaluationTask } from "@/lib/ai/prompts/evaluator";

const tools = [
  {
    name: returnEvaluationTool.name,
    description: returnEvaluationTool.description,
    input_schema: z.toJSONSchema(returnEvaluationTool.inputSchema) as unknown,
  },
];

export async function evaluate(
  claim: { statement: string; category: string },
  evidence: { extractedText: string; sourceDomain?: string },
  deps: { client: AnthropicLike },
): Promise<EvaluationResult> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildEvaluationTask(claim, evidence) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_evaluation" },
    thinking: false,
    maxTokens: 1024,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_evaluation",
  );
  const parsed = EvaluationSchema.safeParse(toolUse?.input);
  if (!parsed.success) {
    return { impact: "neutral", confidence: 0, reasoning: "Evaluator output failed schema validation." };
  }
  return parsed.data;
}
