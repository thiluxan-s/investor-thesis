import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixtureReader } from "./fixtures";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-"));
  mkdirSync(join(dir, "happy"), { recursive: true });
  writeFileSync(join(dir, "happy", "messages.json"), JSON.stringify([{ id: "m0" }, { id: "m1" }]));
  writeFileSync(join(dir, "happy", "tools.json"), JSON.stringify([{ ok: true, output: { results: [] } }]));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("FixtureReader", () => {
  it("replays messages in order", () => {
    const r = new FixtureReader(dir, "happy");
    expect(r.nextMessage()).toEqual({ id: "m0" });
    expect(r.nextMessage()).toEqual({ id: "m1" });
  });
  it("replays tool results in order", () => {
    const r = new FixtureReader(dir, "happy");
    expect(r.nextToolResult()).toEqual({ ok: true, output: { results: [] } });
  });
  it("throws a clear error when a fixture runs out", () => {
    const r = new FixtureReader(dir, "happy");
    r.nextMessage();
    r.nextMessage();
    expect(() => r.nextMessage()).toThrow(/exhausted/i);
  });
});
