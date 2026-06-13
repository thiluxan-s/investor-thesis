import { describe, it, expect } from "vitest";
import { truncateToBytes } from "./text";

describe("truncateToBytes", () => {
  it("returns short input unchanged", () => {
    expect(truncateToBytes("hello", 8192)).toBe("hello");
  });
  it("truncates to at most the byte budget", () => {
    const big = "x".repeat(20000);
    const out = truncateToBytes(big, 8192);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(8192);
  });
});
