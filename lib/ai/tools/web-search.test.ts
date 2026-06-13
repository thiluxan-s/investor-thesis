import { describe, it, expect, vi } from "vitest";
import { webSearchTool } from "./web-search";
import type { ToolContext } from "./types";

function ctx(results: { title: string; url: string; snippet: string }[]): ToolContext {
  return {
    search: { search: vi.fn().mockResolvedValue(results) },
    fetcher: vi.fn(),
    edgarClient: vi.fn(),
    useFixtures: false,
  };
}

describe("webSearchTool", () => {
  it("returns provider results", async () => {
    const c = ctx([{ title: "T", url: "https://reuters.com/a", snippet: "s" }]);
    const res = await webSearchTool.execute({ query: "nvda", limit: 5 }, c);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toEqual({ results: [{ title: "T", url: "https://reuters.com/a", snippet: "s" }] });
    expect(c.search.search).toHaveBeenCalledWith("nvda", 5);
  });
  it("defaults limit to 5 when omitted", async () => {
    const c = ctx([]);
    await webSearchTool.execute({ query: "x" }, c);
    expect(c.search.search).toHaveBeenCalledWith("x", 5);
  });
  it("returns a tool error when the provider throws", async () => {
    const c = ctx([]);
    (c.search.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("rate limited"));
    const res = await webSearchTool.execute({ query: "x" }, c);
    expect(res.ok).toBe(false);
  });
});
