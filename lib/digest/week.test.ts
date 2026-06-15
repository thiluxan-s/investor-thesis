import { describe, it, expect } from "vitest";
import { currentWeekOf } from "./week";

describe("currentWeekOf", () => {
  it("returns the same date for a Sunday (UTC)", () => {
    expect(currentWeekOf(new Date("2026-06-14T09:00:00Z"))).toBe("2026-06-14"); // Sunday
  });
  it("returns the most recent Sunday for a midweek date", () => {
    expect(currentWeekOf(new Date("2026-06-17T23:30:00Z"))).toBe("2026-06-14"); // Wed -> prev Sun
  });
  it("handles the Saturday before a Sunday", () => {
    expect(currentWeekOf(new Date("2026-06-13T00:00:00Z"))).toBe("2026-06-07"); // Sat -> prev Sun
  });
});
