import "server-only";
import { EvaluationSchema, type EvaluationResult } from "@/lib/ai/schemas/evaluation";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the evaluator; execute() is a no-op echo so the
// tool conforms to the Tool interface.
export const returnEvaluationTool: Tool<EvaluationResult> = {
  name: "return_evaluation",
  description:
    "Return your judgment of whether this single piece of evidence strengthens, weakens, or does not " +
    "affect this single claim. Be conservative: choose 'neutral' with low confidence unless the evidence " +
    "clearly bears on the claim.",
  inputSchema: EvaluationSchema,
  async execute(input: EvaluationResult): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
