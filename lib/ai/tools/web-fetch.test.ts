import { describe, it, expect, vi } from "vitest";
import { webFetchTool } from "./web-fetch";
import type { ToolContext } from "./types";

function ctx(fetcher: ToolContext["fetcher"]): ToolContext {
  return { search: { search: vi.fn() }, fetcher, edgarClient: vi.fn(), useFixtures: false };
}

describe("webFetchTool", () => {
  it("refuses domains not on the allow-list without fetching", async () => {
    const fetcher = vi.fn();
    const res = await webFetchTool.execute({ url: "https://randomblog.example/x" }, ctx(fetcher));
    expect(res.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fetches an allow-listed url, converts to markdown, truncates, and returns a source", async () => {
    const html = "<html><head><title>NV Q3</title></head><body><h1>Revenue</h1><p>" + "x".repeat(20000) + "</p></body></html>";
    const fetcher = vi.fn().mockResolvedValue({ status: 200, html, finalUrl: "https://reuters.com/a" });
    const res = await webFetchTool.execute({ url: "https://reuters.com/a" }, ctx(fetcher));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const out = res.output as { markdown: string; source: { domain: string; contentExcerpt: string } };
      expect(out.source.domain).toBe("reuters.com");
      expect(Buffer.byteLength(out.source.contentExcerpt, "utf8")).toBeLessThanOrEqual(8192);
      expect(out.markdown).toContain("Revenue");
    }
  });
  it("returns a tool error on non-200", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 404, html: "", finalUrl: "https://reuters.com/a" });
    const res = await webFetchTool.execute({ url: "https://reuters.com/a" }, ctx(fetcher));
    expect(res.ok).toBe(false);
  });
});
