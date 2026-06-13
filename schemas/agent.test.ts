import { describe, it, expect } from "vitest";
import {
  WebSearchInputSchema,
  WebFetchInputSchema,
  EdgarInputSchema,
  ReturnResultSchema,
} from "./agent";

describe("tool input schemas", () => {
  it("web_search requires a query, caps limit at 10", () => {
    expect(WebSearchInputSchema.safeParse({ query: "nvda revenue" }).success).toBe(true);
    expect(WebSearchInputSchema.safeParse({ query: "x", limit: 20 }).success).toBe(false);
    expect(WebSearchInputSchema.safeParse({}).success).toBe(false);
  });
  it("web_fetch requires a url", () => {
    expect(WebFetchInputSchema.safeParse({ url: "https://reuters.com/a" }).success).toBe(true);
    expect(WebFetchInputSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });
  it("edgar requires a ticker, optional formType enum", () => {
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA" }).success).toBe(true);
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA", formType: "10-K" }).success).toBe(true);
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA", formType: "8-Q" }).success).toBe(false);
  });
  it("return_result validates evidence items", () => {
    const ok = {
      evidence: [
        { source_url: "https://reuters.com/a", title: "T", snippet: "s", claim_indices: [0], extracted_text: "text here" },
      ],
    };
    expect(ReturnResultSchema.safeParse(ok).success).toBe(true);
    expect(ReturnResultSchema.safeParse({ evidence: [{ source_url: "x" }] }).success).toBe(false);
  });
});
