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

export function writeScenarioFixtures(dir: string, files: ScenarioFixtures): void {
  mkdirSync(dir, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  write("messages.json", files.messages);
  write("tools.json", files.tools);
  write("evaluations.json", files.evaluations);
  write("challenge-brief.json", files.challengeBrief);
  // DigestFixtureReader reads a single bare message (no cycling — the
  // summarizer is called at most once per run), unlike the other four files
  // which are arrays. Unwrap here so the file matches what the reader expects.
  write("digest.json", files.digest[0] ?? null);
}
