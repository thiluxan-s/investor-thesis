import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe("formatRelativeTime", () => {
  it("returns 'Not analyzed' for null", () => {
    expect(formatRelativeTime(null, now)).toBe("Not analyzed");
  });
  it("returns 'just now' under 45s", () => {
    expect(formatRelativeTime(ago(10 * S), now)).toBe("just now");
  });
  it("buckets minutes, hours, days, weeks", () => {
    expect(formatRelativeTime(ago(5 * M), now)).toBe("5m ago");
    expect(formatRelativeTime(ago(3 * H), now)).toBe("3h ago");
    expect(formatRelativeTime(ago(2 * D), now)).toBe("2d ago");
    expect(formatRelativeTime(ago(10 * D), now)).toBe("1w ago");
  });
  it("rounds down at boundaries", () => {
    expect(formatRelativeTime(ago(90 * M), now)).toBe("1h ago");
  });
});
