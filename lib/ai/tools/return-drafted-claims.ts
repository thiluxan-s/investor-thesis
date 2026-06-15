import "server-only";
import { DraftedClaimsSchema, type DraftedClaims } from "@/lib/ai/schemas/drafter";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the drafter; execute() echoes for interface conformance.
export const returnDraftedClaimsTool: Tool<DraftedClaims> = {
  name: "return_drafted_claims",
  description:
    "Return 2-7 candidate claims extracted from the user's reasoning. Each claim is a single falsifiable " +
    "statement in the user's own words, a category, and the verbatim source excerpt it was drawn from. " +
    "Do not introduce reasoning the user did not provide; do not assess whether claims are true.",
  inputSchema: DraftedClaimsSchema,
  async execute(input: DraftedClaims): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
