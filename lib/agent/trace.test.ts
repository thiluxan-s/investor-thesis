import { describe, it, expect } from "vitest";
import { extractThinking, extractText, readToolCalls } from "./trace";

describe("trace readers", () => {
  it("extractThinking joins thinking blocks", () => {
    const content = [{ type: "thinking", thinking: "I will search." }, { type: "text", text: "ok" }];
    expect(extractThinking(content)).toBe("I will search.");
  });
  it("extractText joins text blocks", () => {
    const content = [{ type: "text", text: "Hello" }, { type: "tool_use", name: "x", input: {} }];
    expect(extractText(content)).toBe("Hello");
  });
  it("readToolCalls normalizes our shape and flags errors", () => {
    const tc = [
      { tool_name: "web_search", input: { query: "x" }, output: { results: [] } },
      { tool_name: "web_fetch", input: { url: "u" }, error: "Domain not allowed" },
    ];
    const out = readToolCalls(tc);
    expect(out).toHaveLength(2);
    expect(out[1].isError).toBe(true);
    expect(out[1].name).toBe("web_fetch");
  });
  it("is defensive against null/garbage", () => {
    expect(extractThinking(null)).toBe("");
    expect(extractText(undefined)).toBe("");
    expect(readToolCalls("nope")).toEqual([]);
  });
});
