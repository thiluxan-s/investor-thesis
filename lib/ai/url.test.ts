import { describe, it, expect } from "vitest";
import { normalizeUrl, urlHash, hostnameOf } from "./url";

describe("normalizeUrl", () => {
  it("lowercases host, drops trailing slash and fragments", () => {
    expect(normalizeUrl("HTTPS://Reuters.com/article/x/")).toBe("https://reuters.com/article/x");
    expect(normalizeUrl("https://reuters.com/a#section")).toBe("https://reuters.com/a");
  });
  it("strips tracking query params but keeps meaningful ones", () => {
    expect(normalizeUrl("https://x.com/a?utm_source=g&id=5")).toBe("https://x.com/a?id=5");
  });
});
describe("urlHash", () => {
  it("is stable and equal for URLs that normalize the same", () => {
    expect(urlHash("https://reuters.com/a/")).toBe(urlHash("HTTPS://reuters.com/a"));
  });
});
describe("hostnameOf", () => {
  it("returns the lowercased hostname", () => {
    expect(hostnameOf("https://Finance.Yahoo.com/x")).toBe("finance.yahoo.com");
  });
});
