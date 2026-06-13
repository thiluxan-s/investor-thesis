import { describe, it, expect } from "vitest";
import { isTerminalStatus, STATUS_LABEL } from "./run-status";

describe("isTerminalStatus", () => {
  it("non-terminal for queued/running", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
  it("terminal for complete/partial/failed", () => {
    expect(isTerminalStatus("complete")).toBe(true);
    expect(isTerminalStatus("partial")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });
});

describe("STATUS_LABEL", () => {
  it("has a human label per status", () => {
    expect(STATUS_LABEL.running).toBe("Running");
    expect(STATUS_LABEL.complete).toBe("Complete");
  });
});
