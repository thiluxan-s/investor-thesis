import type { z } from "zod";

export type SearchResult = { title: string; url: string; snippet: string };
export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

export type CollectedEvidence = {
  sourceUrl: string;
  title: string;
  domain: string;
  rawContentHash: string;
  contentExcerpt: string;
};

export type ToolContext = {
  search: SearchProvider;
  fetcher: (url: string) => Promise<{ status: number; html: string; finalUrl: string }>;
  edgarClient: (ticker: string, formType?: string) => Promise<{ form: string; filedAt: string; url: string }[]>;
  useFixtures: boolean;
  scenario?: string;
};

export type ToolResult = { ok: true; output: unknown } | { ok: false; error: string };

export interface Tool<I = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  execute(input: I, ctx: ToolContext): Promise<ToolResult>;
}
