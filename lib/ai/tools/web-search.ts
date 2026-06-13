import "server-only";
import { WebSearchInputSchema, type WebSearchInput } from "@/schemas/agent";
import type { Tool, ToolContext, ToolResult } from "./types";

export const webSearchTool: Tool<WebSearchInput> = {
  name: "web_search",
  description:
    "Search the web for recent, relevant pages. Returns a list of {title, url, snippet}. " +
    "Use it to find candidate sources, then call web_fetch to read the promising ones.",
  inputSchema: WebSearchInputSchema,
  async execute(input: WebSearchInput, ctx: ToolContext): Promise<ToolResult> {
    try {
      const results = await ctx.search.search(input.query, input.limit ?? 5);
      return { ok: true, output: { results } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "web_search failed" };
    }
  },
};
