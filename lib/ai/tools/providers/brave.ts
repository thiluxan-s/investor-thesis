import "server-only";
import type { SearchProvider, SearchResult } from "@/lib/ai/tools/types";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export function createBraveProvider(apiKey: string): SearchProvider {
  return {
    async search(query: string, limit: number): Promise<SearchResult[]> {
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(limit));
      const res = await fetch(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      });
      if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
      const data = (await res.json()) as { web?: { results?: { title: string; url: string; description: string }[] } };
      return (data.web?.results ?? []).slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));
    },
  };
}
