import { describe, it, expect, vi } from "vitest";
import { edgarTool } from "./edgar";
import type { ToolContext } from "./types";

function ctx(edgarClient: ToolContext["edgarClient"]): ToolContext {
  return { search: { search: vi.fn() }, fetcher: vi.fn(), edgarClient, useFixtures: false };
}

describe("edgarTool", () => {
  it("returns filings from the edgar client", async () => {
    const filings = [{ form: "10-Q", filedAt: "2026-02-01", url: "https://www.sec.gov/x" }];
    const c = ctx(vi.fn().mockResolvedValue(filings));
    const res = await edgarTool.execute({ ticker: "NVDA", formType: "10-Q" }, c);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toEqual({ filings });
    expect(c.edgarClient).toHaveBeenCalledWith("NVDA", "10-Q");
  });
  it("returns a tool error when the client throws", async () => {
    const c = ctx(vi.fn().mockRejectedValue(new Error("not found")));
    const res = await edgarTool.execute({ ticker: "ZZZZ" }, c);
    expect(res.ok).toBe(false);
  });
});
