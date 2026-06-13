import "server-only";
import { EdgarInputSchema, type EdgarInput } from "@/schemas/agent";
import type { Tool, ToolContext, ToolResult } from "./types";

export const edgarTool: Tool<EdgarInput> = {
  name: "edgar",
  description:
    "Look up a company's recent SEC filings by ticker (optionally filtered to 10-K/10-Q/8-K). " +
    "Returns {form, filedAt, url}; pass a filing url to web_fetch to read it.",
  inputSchema: EdgarInputSchema,
  async execute(input: EdgarInput, ctx: ToolContext): Promise<ToolResult> {
    try {
      const filings = await ctx.edgarClient(input.ticker, input.formType);
      return { ok: true, output: { filings } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "edgar lookup failed" };
    }
  },
};
