import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChallengeBriefFixtureReader } from "./challenge-brief-fixtures";

function scenarioRoot(items: unknown[]): string {
  const root = mkdtempSync(join(tmpdir(), "cb-fixture-"));
  mkdirSync(join(root, "scn"));
  writeFileSync(join(root, "scn", "challenge-brief.json"), JSON.stringify(items));
  return root;
}

describe("ChallengeBriefFixtureReader", () => {
  it("returns recorded messages in order", () => {
    const root = scenarioRoot([{ a: 1 }, { a: 2 }]);
    const r = new ChallengeBriefFixtureReader("scn", root);
    expect(r.next()).toEqual({ a: 1 });
    expect(r.next()).toEqual({ a: 2 });
  });

  it("cycles so repeated runs never exhaust it", () => {
    const root = scenarioRoot([{ a: 1 }]);
    const r = new ChallengeBriefFixtureReader("scn", root);
    r.next();
    expect(r.next()).toEqual({ a: 1 });
  });

  it("throws a named error when the scenario is missing", () => {
    expect(() => new ChallengeBriefFixtureReader("nope", scenarioRoot([{ a: 1 }]))).toThrow(/not found/i);
  });

  it("throws when the fixture is empty", () => {
    expect(() => new ChallengeBriefFixtureReader("scn", scenarioRoot([]))).toThrow(/empty/i);
  });
});
