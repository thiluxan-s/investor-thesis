import "server-only";
import { ChallengeBriefSchema, type ChallengeBriefOutput } from "@/lib/ai/schemas/challenge-brief";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the challenger; execute() is a no-op echo so the
// tool conforms to the Tool interface.
export const returnChallengeBriefTool: Tool<ChallengeBriefOutput> = {
  name: "return_challenge_brief",
  description:
    "Return the case against this thesis, argued only from the numbered evidence supplied. Cite evidence " +
    "indices for every point. Describe what the evidence shows — do not recommend buying, selling, or " +
    "holding, and do not estimate how likely the thesis is to fail.",
  inputSchema: ChallengeBriefSchema,
  async execute(input: ChallengeBriefOutput): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
