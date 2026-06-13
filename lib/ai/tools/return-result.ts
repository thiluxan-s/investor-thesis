import "server-only";
import { ReturnResultSchema } from "@/schemas/agent";
import type { Tool, ToolResult } from "./types";
import type { z } from "zod";

type ReturnResultInput = z.infer<typeof ReturnResultSchema>;

// The loop intercepts return_result as the completion signal; execute() is a
// no-op echo so the tool conforms to the Tool interface.
export const returnResultTool: Tool<ReturnResultInput> = {
  name: "return_result",
  description:
    "Call this exactly once when you are done. Provide the final list of evidence items you gathered. " +
    "This ends the research run.",
  inputSchema: ReturnResultSchema,
  // ctx is unused — return_result needs no I/O; the loop intercepts it as the
  // completion signal. Fewer params than the Tool interface is allowed in TS.
  async execute(input: ReturnResultInput): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
