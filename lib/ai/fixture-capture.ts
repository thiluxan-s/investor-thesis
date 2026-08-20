import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_RUN_MODES, type AgentRunMode } from "@/schemas/agent";
import type { AnthropicLike } from "@/lib/ai/client";

export type HarnessArgs = {
  scenario: string;
  mode: AgentRunMode;
  live: boolean;
  thesisId: string | undefined;
};

// Positional: [scenario] [mode]. Flags: --live, --thesis <uuid>. Flags may sit
// anywhere; positionals are read in order from what's left.
export function parseHarnessArgs(argv: string[]): HarnessArgs {
  const positional: string[] = [];
  let live = false;
  let thesisId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") {
      live = true;
    } else if (arg === "--thesis") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("--thesis requires a thesis id");
      thesisId = value;
    } else {
      positional.push(arg);
    }
  }

  const scenario = positional[0] ?? "nvda-happy-path";
  const rawMode = positional[1] ?? "research";
  if (!(AGENT_RUN_MODES as readonly string[]).includes(rawMode)) {
    throw new Error(`Unknown mode: ${rawMode} (expected ${AGENT_RUN_MODES.join(" | ")})`);
  }
  return { scenario, mode: rawMode as AgentRunMode, live, thesisId };
}

// Wraps a client so every raw response is collected for capture. The response is
// passed through untouched — a fixture must be exactly what the API returned.
export function tapClient(inner: AnthropicLike, sink: unknown[]): AnthropicLike {
  return {
    async createMessage(params) {
      const response = await inner.createMessage(params);
      sink.push(response);
      return response;
    },
  };
}

type PersistedToolCall = { tool_name?: string; output?: unknown; error?: unknown };

// tools.json is reconstructed from what the loop persisted, because real tool
// execution happens inside runResearcher and can't be tapped from outside.
// Order matters: replay hands these back one at a time in this order.
export function toolResultsFromIterations(iterations: { toolCalls: unknown }[]): unknown[] {
  const out: unknown[] = [];
  for (const iteration of iterations) {
    if (!Array.isArray(iteration.toolCalls)) continue;
    for (const raw of iteration.toolCalls as PersistedToolCall[]) {
      // return_result is the loop's exit contract, not a tool whose result is replayed.
      if (raw.tool_name === "return_result") continue;
      out.push(raw.output !== undefined ? raw.output : { error: raw.error });
    }
  }
  return out;
}

export type ScenarioFixtures = {
  messages: unknown[];
  tools: unknown[];
  evaluations: unknown[];
  challengeBrief: unknown[];
  digest: unknown[];
};

export type WriteScenarioFixturesResult = {
  written: string[];
  skipped: string[];
};

// Two sinks are routinely empty on a legitimate live run: challengeBrief when
// the brief pipeline short-circuits (e.g. no_weakening_evidence), and digest
// when no thesis changed. Writing those through unconditionally would replace
// a readable committed fixture with `[]` or `null` — content the matching
// fixture reader can't consume — destroying a working scenario on a run that
// otherwise succeeded. So every sink is skipped when empty, leaving whatever
// is already committed at that path untouched, and the caller is told which
// files actually landed so a partial recording can't look like a full one.
export function writeScenarioFixtures(dir: string, files: ScenarioFixtures): WriteScenarioFixturesResult {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];

  const writeArray = (name: string, value: unknown[]) => {
    if (value.length === 0) {
      skipped.push(name);
      return;
    }
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
    written.push(name);
  };

  writeArray("messages.json", files.messages);
  writeArray("tools.json", files.tools);
  writeArray("evaluations.json", files.evaluations);
  writeArray("challenge-brief.json", files.challengeBrief);

  // DigestFixtureReader reads a single bare message (no cycling — the
  // summarizer is called at most once per run), unlike the other four files
  // which are arrays. Unwrap here so the file matches what the reader expects.
  if (files.digest.length === 0) {
    skipped.push("digest.json");
  } else {
    writeFileSync(join(dir, "digest.json"), JSON.stringify(files.digest[0], null, 2) + "\n", "utf8");
    written.push("digest.json");
  }

  return { written, skipped };
}
