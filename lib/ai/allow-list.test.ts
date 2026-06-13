import { describe, it, expect } from "vitest";
import { isAllowedDomain } from "./allow-list";

describe("isAllowedDomain", () => {
  it("allows listed domains and their subdomains", () => {
    expect(isAllowedDomain("https://www.reuters.com/x")).toBe(true);
    expect(isAllowedDomain("https://reuters.com/x")).toBe(true);
    expect(isAllowedDomain("https://data.sec.gov/x")).toBe(true);
    expect(isAllowedDomain("https://investor.nvidia.com/x")).toBe(true);
  });
  it("rejects unlisted domains", () => {
    expect(isAllowedDomain("https://randomblog.example/x")).toBe(false);
    expect(isAllowedDomain("https://notreuters.com.evil.test/x")).toBe(false);
  });
});
