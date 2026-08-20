import { describe, it, expect } from "vitest";
import { AGENT_RUN_MODES } from "@/schemas/agent";
import { MODE_LABEL, MODE_CLASS, MODE_HEADING, showsModeBadge } from "./run-mode";

describe("run mode presentation", () => {
  it("labels every mode", () => {
    for (const mode of AGENT_RUN_MODES) {
      expect(MODE_LABEL[mode]).toBeTruthy();
      expect(MODE_CLASS[mode]).toBeTruthy();
      expect(MODE_HEADING[mode]).toBeTruthy();
    }
  });

  it("never uses bear-case language", () => {
    // For a short thesis the counter-case is bullish, so "bear" is wrong half
    // the time. This is a project-wide naming rule, not a style preference.
    // MODE_HEADING is included alongside MODE_LABEL because it is exactly
    // where someone would later write "Bear case run" without noticing.
    for (const label of [...Object.values(MODE_LABEL), ...Object.values(MODE_HEADING)]) {
      expect(label.toLowerCase()).not.toContain("bear");
    }
  });

  it("badges challenge runs only, leaving research traces unchanged", () => {
    expect(showsModeBadge("challenge")).toBe(true);
    expect(showsModeBadge("research")).toBe(false);
  });
});
