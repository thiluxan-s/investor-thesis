import { describe, it, expect } from "vitest";
import { scenarioForMode, RESEARCH_SCENARIO, CHALLENGE_SCENARIO } from "./scenario";

describe("scenarioForMode", () => {
  it("maps challenge runs to the challenge scenario", () => {
    expect(scenarioForMode("challenge")).toBe(CHALLENGE_SCENARIO);
  });
  it("maps research runs to the research scenario", () => {
    expect(scenarioForMode("research")).toBe(RESEARCH_SCENARIO);
  });
  it("never returns the research scenario for a challenge run", () => {
    // Regression guard: a challenge run carrying nvda-happy-path replays the
    // RESEARCH fixture through the challenge loop and looks like it worked.
    expect(scenarioForMode("challenge")).not.toBe(RESEARCH_SCENARIO);
  });
});
