import "server-only";
import { DigestSchema, type DigestResult } from "@/lib/ai/schemas/digest";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the summarizer; execute() echoes for interface conformance.
export const returnDigestTool: Tool<DigestResult> = {
  name: "return_digest",
  description:
    "Return the weekly digest: for each thesis you were given, a 2-4 sentence plain-English summary of " +
    "what the new evidence means for that thesis and how its health moved. One entry per input thesis.",
  inputSchema: DigestSchema,
  async execute(input: DigestResult): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
