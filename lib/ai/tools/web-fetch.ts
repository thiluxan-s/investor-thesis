import "server-only";
import TurndownService from "turndown";
import { WebFetchInputSchema, type WebFetchInput } from "@/schemas/agent";
import { isAllowedDomain } from "@/lib/ai/allow-list";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import { truncateToBytes } from "@/lib/ai/text";
import type { Tool, ToolContext, ToolResult } from "./types";

const MAX_BYTES = 8192;
const turndown = new TurndownService({ headingStyle: "atx" });

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

export const webFetchTool: Tool<WebFetchInput> = {
  name: "web_fetch",
  description:
    "Fetch a single allow-listed URL and return its main content as markdown (truncated). " +
    "Only reputable news, investor-relations, and SEC/EDGAR domains are permitted; others are refused.",
  inputSchema: WebFetchInputSchema,
  async execute(input: WebFetchInput, ctx: ToolContext): Promise<ToolResult> {
    if (!isAllowedDomain(input.url)) {
      return { ok: false, error: `Domain not allowed: ${input.url}. Choose a reputable news/IR/SEC source.` };
    }
    try {
      const { status, html, finalUrl } = await ctx.fetcher(input.url);
      if (status !== 200) return { ok: false, error: `Fetch returned status ${status}` };
      // Re-validate after redirects: fetch follows 3xx, so the final URL can be
      // off the allow-list even though the input URL was allowed (SSRF guard).
      if (!isAllowedDomain(finalUrl)) {
        return { ok: false, error: `Refusing content from a non-allowed domain after redirect: ${finalUrl}` };
      }
      const markdown = truncateToBytes(turndown.turndown(html), MAX_BYTES);
      const title = extractTitle(html);
      const source = {
        sourceUrl: finalUrl,
        title,
        domain: hostnameOf(finalUrl),
        rawContentHash: sha256(html),
        contentExcerpt: markdown,
      };
      return { ok: true, output: { url: finalUrl, title, markdown, source } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "web_fetch failed" };
    }
  },
};
