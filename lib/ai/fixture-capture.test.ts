import { describe, it, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { FixtureReader } from "@/lib/ai/fixtures";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import {
  parseHarnessArgs,
  tapClient,
  toolResultsFromIterations,
  writeScenarioFixtures,
} from "./fixture-capture";

describe("parseHarnessArgs", () => {
  it("defaults to the research scenario, research mode, offline", () => {
    expect(parseHarnessArgs([])).toEqual({
      scenario: "nvda-happy-path",
      mode: "research",
      live: false,
      thesisId: undefined,
    });
  });

  it("reads positional scenario and mode", () => {
    expect(parseHarnessArgs(["nvda-challenge", "challenge"])).toEqual({
      scenario: "nvda-challenge",
      mode: "challenge",
      live: false,
      thesisId: undefined,
    });
  });

  it("reads --live and --thesis regardless of position", () => {
    expect(parseHarnessArgs(["--live", "nvda-challenge", "--thesis", "abc-123", "challenge"])).toEqual({
      scenario: "nvda-challenge",
      mode: "challenge",
      live: true,
      thesisId: "abc-123",
    });
  });

  it("rejects an unknown mode instead of silently defaulting", () => {
    expect(() => parseHarnessArgs(["nvda-challenge", "sideways"])).toThrow(/mode/i);
  });

  it("rejects --thesis with no value", () => {
    expect(() => parseHarnessArgs(["--thesis"])).toThrow(/--thesis/);
  });
});

describe("tapClient", () => {
  it("returns the inner response and records it", async () => {
    const response = { content: [], stop_reason: "end_turn" } as unknown as Anthropic.Message;
    const inner: AnthropicLike = { createMessage: vi.fn(async () => response) };
    const sink: unknown[] = [];
    const tapped = tapClient(inner, sink);

    const got = await tapped.createMessage({ system: "s", tools: [], messages: [] });

    expect(got).toBe(response);
    expect(sink).toEqual([response]);
  });
});

describe("toolResultsFromIterations", () => {
  it("flattens tool outputs in iteration order and skips return_result", () => {
    const iterations = [
      { toolCalls: [{ tool_name: "web_search", input: {}, output: { hits: 1 } }] },
      { toolCalls: [{ tool_name: "web_fetch", input: {}, output: { text: "a" } }] },
      { toolCalls: [{ tool_name: "return_result", input: { evidence: [] } }] },
    ];
    expect(toolResultsFromIterations(iterations)).toEqual([{ hits: 1 }, { text: "a" }]);
  });

  it("records a failed call as an error object so replay stays 1:1", () => {
    const iterations = [{ toolCalls: [{ tool_name: "web_fetch", input: {}, error: "blocked" }] }];
    expect(toolResultsFromIterations(iterations)).toEqual([{ error: "blocked" }]);
  });

  it("ignores iterations with no tool calls", () => {
    expect(toolResultsFromIterations([{ toolCalls: null }, { toolCalls: [] }])).toEqual([]);
  });
});

describe("writeScenarioFixtures", () => {
  it("writes five files that the fixture readers can read back", () => {
    const root = mkdtempSync(join(tmpdir(), "fixcap-"));
    const message = { content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };

    writeScenarioFixtures(join(root, "scenario-x"), {
      messages: [message],
      tools: [{ hits: 1 }],
      evaluations: [message],
      challengeBrief: [message],
      digest: [message],
    });

    const reader = new FixtureReader(root, "scenario-x");
    expect(reader.nextMessage()).toEqual(message);
    expect(reader.nextToolResult()).toEqual({ hits: 1 });

    // Every reader that consumes a scenario must accept what we wrote — a file
    // the capture produces but no reader can open is a silent dead end.
    expect(new EvaluationFixtureReader("scenario-x", root).next()).toEqual(message);
    expect(new ChallengeBriefFixtureReader("scenario-x", root).next()).toEqual(message);
    expect(new DigestFixtureReader("scenario-x", root).next()).toEqual(message);

    const brief = JSON.parse(readFileSync(join(root, "scenario-x", "challenge-brief.json"), "utf8"));
    expect(brief).toEqual([message]);
  });

  it("reports which files were written", () => {
    const root = mkdtempSync(join(tmpdir(), "fixcap-"));
    const message = { content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };

    const result = writeScenarioFixtures(join(root, "scenario-y"), {
      messages: [message],
      tools: [{ hits: 1 }],
      evaluations: [message],
      challengeBrief: [message],
      digest: [message],
    });

    expect(result).toEqual({
      written: ["messages.json", "tools.json", "evaluations.json", "challenge-brief.json", "digest.json"],
      skipped: [],
    });
  });

  it("leaves an existing challenge-brief.json untouched when the sink is empty", () => {
    const root = mkdtempSync(join(tmpdir(), "fixcap-"));
    const dir = join(root, "scenario-z");
    mkdirSync(dir, { recursive: true });
    const existing = [{ committed: true }];
    writeFileSync(join(dir, "challenge-brief.json"), JSON.stringify(existing), "utf8");
    const message = { content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };

    const result = writeScenarioFixtures(dir, {
      messages: [message],
      tools: [{ hits: 1 }],
      evaluations: [message],
      challengeBrief: [], // brief pipeline short-circuited (e.g. no_weakening_evidence)
      digest: [message],
    });

    expect(result.skipped).toEqual(["challenge-brief.json"]);
    expect(result.written).not.toContain("challenge-brief.json");
    const onDisk = JSON.parse(readFileSync(join(dir, "challenge-brief.json"), "utf8"));
    expect(onDisk).toEqual(existing);
  });

  it("leaves an existing digest.json untouched when the sink is empty", () => {
    const root = mkdtempSync(join(tmpdir(), "fixcap-"));
    const dir = join(root, "scenario-w");
    mkdirSync(dir, { recursive: true });
    const existing = { committed: true };
    writeFileSync(join(dir, "digest.json"), JSON.stringify(existing), "utf8");
    const message = { content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };

    const result = writeScenarioFixtures(dir, {
      messages: [message],
      tools: [{ hits: 1 }],
      evaluations: [message],
      challengeBrief: [message],
      digest: [], // no thesis changed this run
    });

    expect(result.skipped).toEqual(["digest.json"]);
    expect(result.written).not.toContain("digest.json");
    const onDisk = JSON.parse(readFileSync(join(dir, "digest.json"), "utf8"));
    expect(onDisk).toEqual(existing);
  });
});
