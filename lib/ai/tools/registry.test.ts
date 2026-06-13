import { describe, it, expect, vi } from "vitest";
import { TOOLS, toolByName, executeToolCallSafely } from "./registry";
import type { ToolContext } from "./types";

const ctx: ToolContext = {
  search: { search: vi.fn().mockResolvedValue([]) },
  fetcher: vi.fn(),
  edgarClient: vi.fn(),
  useFixtures: false,
};

describe("tool registry", () => {
  it("exposes the four tools by name", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(["edgar", "return_result", "web_fetch", "web_search"]);
    expect(toolByName("web_search")?.name).toBe("web_search");
    expect(toolByName("nope")).toBeUndefined();
  });
  it("returns a tool error for an unknown tool", async () => {
    const r = await executeToolCallSafely("nope", {}, ctx);
    expect(r.ok).toBe(false);
  });
  it("returns a tool error for invalid input instead of throwing", async () => {
    const r = await executeToolCallSafely("web_search", { limit: 99 }, ctx);
    expect(r.ok).toBe(false);
  });
  it("executes a valid call", async () => {
    const r = await executeToolCallSafely("web_search", { query: "x" }, ctx);
    expect(r.ok).toBe(true);
  });
});
