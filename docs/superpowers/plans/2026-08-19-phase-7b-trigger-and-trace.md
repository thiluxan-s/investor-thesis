# Phase 7b — Challenge Trigger & Run-Trace Brief — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can point the agent against a thesis and read the resulting brief on the run trace, built on recorded rather than hand-authored agent output.

**Architecture:** No new agent logic — 7b reads what the Phase 7a engine already produces. Testable logic goes in `lib/` (pure functions + repositories) because `vitest.config.ts` only includes `lib/**` and `schemas/**`; the `app/` server action stays a thin validated wrapper. The fixture harness gains a `--live` capture mode so the `nvda-challenge` scenario can be recorded once, before any UI is designed against it.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Drizzle + Neon, Zod, Vitest, Tailwind + shadcn/ui, Anthropic SDK, Inngest.

**Spec:** `docs/superpowers/specs/2026-08-19-phase-7b-trigger-and-trace-design.md`

## Global Constraints

- **TypeScript strict. No `any`** — use `unknown` and narrow. Never suppress errors silently.
- **Tests require Node 22.** `npm test` fails on Node 21 with a cryptic `styleText` error. Check `node -v` first.
- **Vitest only collects `lib/**/*.test.ts` and `schemas/**/*.test.ts`.** A test placed under `app/` or `components/` will never run. Put logic that needs testing in `lib/`.
- **Absolute imports via `@/`.** Never `../../../lib/...`.
- **Zod validates every AI output and every server-action input.** Server Actions return `{ ok: true, data } | { ok: false, error }` — never throw across the boundary.
- **Copy: "Challenge", never "bear case".** For a `short` thesis the counter-case is bullish, so "bear" is wrong half the time. Applies to every user-visible string.
- **The brief never recommends an action.** No "sell", no probability that the thesis is wrong. It summarises counter-evidence the evaluator scored.
- **Never pass `mode` into the evaluator's prompt or task inputs.** The evaluator is deliberately mode-blind — one of three layers stopping challenge mode from inflating its own verdicts.
- **`npm run typecheck` and `npm run lint` must pass before every commit.**
- **Wait for the user's explicit approval before `git add` or `git commit`.** Every commit, no exceptions for small ones. Summarize the change, show the diff, wait.
- **Dev and production share one Neon database.** Anything written locally is written to the database serving `/demo`.

---

## Task 1: `--live` capture on the fixture harness

Builds the capability the recording needs. Pure helpers live in `lib/` so they are testable; the script wires them.

**Files:**
- Create: `lib/ai/fixture-capture.ts`
- Test: `lib/ai/fixture-capture.test.ts`
- Modify: `scripts/run-agent-fixture.ts`
- Modify: `scripts/seed-demo.ts:50`

**Interfaces:**
- Consumes: `AgentRunMode` / `AGENT_RUN_MODES` from `@/schemas/agent`; `FixtureReader`, `FIXTURE_ROOT` from `@/lib/ai/fixtures`; `AnthropicLike`, `CreateMessageParams` from `@/lib/ai/client`.
- Produces: `parseHarnessArgs(argv: string[]): HarnessArgs`; `tapClient(inner: AnthropicLike, sink: unknown[]): AnthropicLike`; `toolResultsFromIterations(iterations: { toolCalls: unknown }[]): unknown[]`; `writeScenarioFixtures(dir: string, files: ScenarioFixtures): void`; types `HarnessArgs`, `ScenarioFixtures`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/fixture-capture.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -v && npx vitest run lib/ai/fixture-capture.test.ts`
Expected: FAIL — `Failed to resolve import "./fixture-capture"`. Node must report v22.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/fixture-capture.ts`:

```ts
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
  const write = (name: string, value: unknown[]) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  write("messages.json", files.messages);
  write("tools.json", files.tools);
  write("evaluations.json", files.evaluations);
  write("challenge-brief.json", files.challengeBrief);
  write("digest.json", files.digest);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ai/fixture-capture.test.ts`
Expected: PASS — 9 tests.

All three readers take `(scenario, root = FIXTURE_ROOT)`, so passing the temp dir works without touching them.

- [ ] **Step 5: Wire `--live` into the harness script**

In `scripts/run-agent-fixture.ts`, replace the two argv lines at the top of `main()`:

```ts
  const scenario = process.argv[2] ?? "nvda-happy-path";
  const mode = (process.argv[3] as AgentRunMode) ?? "research";

  const [thesis] = await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");
```

with:

```ts
  const args = parseHarnessArgs(process.argv.slice(2));
  const { scenario, mode, live } = args;

  // --live spends real money. Refuse the incoherent combination outright rather
  // than silently ignoring one half of it.
  if (live && serverEnv.USE_AI_FIXTURES) {
    throw new Error("--live cannot run with USE_AI_FIXTURES=1. Unset it and re-run.");
  }

  const [thesis] = args.thesisId
    ? await db.select().from(theses).where(eq(theses.id, args.thesisId)).limit(1)
    : await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");

  if (live) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\nLIVE RUN — this calls the Anthropic API and spends real money.`);
    console.log(`  thesis:   ${thesis.ticker} — ${thesis.title} (${thesis.id})`);
    console.log(`  scenario: ${scenario}  mode: ${mode}`);
    console.log(`  writes:   __fixtures__/agent-runs/${scenario}/ (5 files, overwritten)\n`);
    const answer = await rl.question(`Type "record" to continue: `);
    rl.close();
    if (answer.trim() !== "record") throw new Error("Aborted.");
  }
```

Remove the now-unused type import — the cast on the old line 48 was its only use, so leaving it fails `npm run lint`:

```ts
import type { AgentRunMode } from "@/schemas/agent";   // DELETE this line
```

Add these imports at the top of the file:

```ts
import { createInterface } from "node:readline/promises";
import { serverEnv } from "@/lib/env.server";
import { createAnthropicClient } from "@/lib/ai/client";
import { buildToolContext } from "@/lib/ai/tool-context";
import {
  parseHarnessArgs,
  tapClient,
  toolResultsFromIterations,
  writeScenarioFixtures,
} from "@/lib/ai/fixture-capture";
import { join } from "node:path";
```

- [ ] **Step 6: Make each client and the tool context mode-aware**

Still in `scripts/run-agent-fixture.ts`, declare the capture sinks just above the researcher client, and branch every client on `live`.

Replace:

```ts
  const reader = new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = {
    createMessage: async () => reader.nextMessage() as Anthropic.Message,
  };
  // Tool execution is replayed from the fixture (same mechanism as run-agent.ts).
  const toolRunner = async (): Promise<ToolResult> => ({ ok: true, output: reader.nextToolResult() });
  const toolContext: ToolContext = {
    search: { search: async () => [] },
    fetcher: async () => ({ status: 200, html: "", finalUrl: "" }),
    edgarClient: async () => [],
    useFixtures: true,
    scenario,
  };
```

with:

```ts
  const captured = {
    messages: [] as unknown[],
    evaluations: [] as unknown[],
    challengeBrief: [] as unknown[],
    digest: [] as unknown[],
  };

  const reader = live ? null : new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.messages)
    : { createMessage: async () => reader!.nextMessage() as Anthropic.Message };

  // Offline: tool execution is replayed from the fixture (same mechanism as
  // run-agent.ts). Live: undefined, so the loop runs the real tools and we
  // recover their outputs from the persisted iterations afterwards.
  const toolRunner = live
    ? undefined
    : async (): Promise<ToolResult> => ({ ok: true, output: reader!.nextToolResult() });
  const toolContext: ToolContext = live
    ? buildToolContext(scenario)
    : {
        search: { search: async () => [] },
        fetcher: async () => ({ status: 200, html: "", finalUrl: "" }),
        edgarClient: async () => [],
        useFixtures: true,
        scenario,
      };
```

Then wrap the three remaining clients. Replace `const evalClient: AnthropicLike = { createMessage: async () => evalReader.next() as Anthropic.Message };` with:

```ts
  const evalClient: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.evaluations)
    : { createMessage: async () => evalReader.next() as Anthropic.Message };
```

Replace the digest client line with:

```ts
  const digestClient: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.digest)
    : { createMessage: async () => new DigestFixtureReader(scenario).next() as Anthropic.Message };
```

Replace the brief client line inside the `if (mode === "challenge")` block with:

```ts
    const briefClient: AnthropicLike = live
      ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.challengeBrief)
      : { createMessage: async () => briefReader.next() as Anthropic.Message };
```

Guard the offline-only reader constructions so they don't throw under `--live`: change `const evalReader = new EvaluationFixtureReader(scenario);` to `const evalReader = live ? null : new EvaluationFixtureReader(scenario);` (and `evalReader.next()` to `evalReader!.next()`), and likewise `const briefReader = live ? null : new ChallengeBriefFixtureReader(scenario);` with `briefReader!.next()`.

- [ ] **Step 7: Write the captured fixtures at the end of the run**

In `scripts/run-agent-fixture.ts`, immediately before the final `console.log(JSON.stringify(...))`, add:

```ts
  if (live) {
    const dir = join(FIXTURE_ROOT, scenario);
    writeScenarioFixtures(dir, {
      messages: captured.messages,
      tools: toolResultsFromIterations(its),
      evaluations: captured.evaluations,
      challengeBrief: captured.challengeBrief,
      digest: captured.digest,
    });
    console.log(`Wrote 5 fixture files to ${dir}`);
  }
```

`its` is the `listIterations(run.id)` result already loaded above.

- [ ] **Step 8: Fix the demo seed's claim ordering**

In `scripts/seed-demo.ts`, line 50. Both `claim_indices` and the brief's `claim_index` are positional into this list, and Postgres does not guarantee order without `ORDER BY`.

Replace:

```ts
  const cs = await db.select().from(claimsTable).where(eq(claimsTable.thesisId, DEMO_THESIS_ID));
```

with:

```ts
  // Positional claim indices (researcher claim_indices, brief claim_index) are
  // resolved against this order — it must be the ordinal order, not whatever
  // Postgres returns.
  const cs = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.thesisId, DEMO_THESIS_ID))
    .orderBy(claimsTable.ordinal);
```

- [ ] **Step 9: Verify nothing offline regressed**

Run:
```bash
npm run typecheck && npm run lint && npm test
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
  --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge
```
Expected: typecheck/lint clean, all tests pass, and the offline harness still completes and prints a challenge brief — proving `--live` defaulted off and changed nothing.

Also verify the refusal works:
```bash
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
  --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge --live
```
Expected: throws `--live cannot run with USE_AI_FIXTURES=1`. No API call, no prompt.

- [ ] **Step 10: Commit** (after user approval)

```bash
git add lib/ai/fixture-capture.ts lib/ai/fixture-capture.test.ts \
        scripts/run-agent-fixture.ts scripts/seed-demo.ts
git commit -m "feat: add --live fixture capture to the agent harness"
```

---

## Task 2: Record the `nvda-challenge` scenario

**This task spends real money and writes to the shared dev/production database.** It is a manual, gated session — stop and get explicit approval before running Step 3.

**Files:**
- Modify: `__fixtures__/agent-runs/nvda-challenge/messages.json`, `tools.json`, `evaluations.json`, `challenge-brief.json`, `digest.json`
- Modify: `__fixtures__/agent-runs/nvda-challenge/README.md`
- Modify: `docs/phases/phase-7-challenge.md`

**Interfaces:**
- Consumes: Task 1's `--live` / `--thesis` harness.
- Produces: a recorded `nvda-challenge` scenario every later task and `/demo` (7c) can rely on.

- [ ] **Step 1: Seed the demo thesis so the brief has standing evidence**

```bash
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
  --import tsx scripts/seed-demo.ts
```

This is fixtured and free. It matters: `writeBriefForRun` returns `no_weakening_evidence` without calling the model if the thesis has no standing `weakens` links, and the seeded `nvda-happy-path` evaluations contain exactly one. Seeding first means the recording still produces a brief even if the live challenge run finds nothing new.

- [ ] **Step 2: Confirm the demo thesis id and its claim order**

```bash
node --env-file=.env.local -e '
const { neon } = require("./node_modules/@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
sql`select c.ordinal, c.statement from claims c
     where c.thesis_id = ${"00000000-0000-4000-8000-000000000d3a"}
     order by c.ordinal`.then(r => console.log(r));
'
```
Expected: exactly three claims, ordinals 0/1/2, in the order declared in `scripts/seed-demo.ts`'s `DEMO_CLAIMS`. The recording's positional indices are resolved against this order.

- [ ] **Step 3: Get explicit approval, then record**

Stop. Tell the user: the estimated cost ($0.10–1.00), that it writes a real challenge run onto the demo thesis in the shared database, and that the run may legitimately find nothing. Wait for approval.

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge \
  --live --thesis 00000000-0000-4000-8000-000000000d3a
```

Note there is no `USE_AI_FIXTURES=1` — the script refuses to run with it. Type `record` at the prompt.

- [ ] **Step 4: Verify the recording is usable**

Check the script's JSON output shows `"brief": { "headline": ..., "pointCount": N }` with `N >= 1`. Then read all five files.

If `brief` is `null`, the run produced nothing citable. **Do not commit a fixture with no brief** — report the outcome to the user and let them decide whether to re-run (which costs again). The rest of the phase can proceed on the existing fixture in the meantime; only `/demo` (7c) is truly blocked.

Sanity checks on the files:
- `messages.json` — real prose, real tool calls, no placeholder text.
- `tools.json` — one entry per non-`return_result` tool call, in order.
- `challenge-brief.json` — every `claim_index` in 0–2; every `evidence_indices` entry in range.
- Confirm the replay still works: re-run the Step 9 offline command from Task 1 and check it completes.

- [ ] **Step 5: Replace the provisional README**

Overwrite `__fixtures__/agent-runs/nvda-challenge/README.md` with this content (shown in a four-backtick fence so the inner block survives; write only the inner content):

````markdown
# nvda-challenge

Recorded from a live challenge run against the demo NVDA thesis. The messages,
tool results, evaluations, brief, and digest here are real Anthropic API output.

Re-record (spends real money — the script prompts for confirmation and refuses
to run with `USE_AI_FIXTURES=1`):

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge \
  --live --thesis <demo-thesis-id>
```

`--thesis` is not optional for a re-recording. Both `claim_indices` and the
brief's `claim_index` are positional into the ordinal-ordered claim list, so a
scenario recorded against a different claim set maps arguments onto the wrong
claims — silently, because the indices stay in range.
````

- [ ] **Step 6: Correct the phase doc**

In `docs/phases/phase-7-challenge.md`, the section "The fixture-recording gate" documents a command that never recorded anything. Replace its body with an accurate account: the harness replayed fixtures unconditionally and never read `USE_AI_FIXTURES`; Phase 7b added `--live` capture and `--thesis` targeting; the scenario is now recorded. Keep the section — it is the record of why the gate existed.

- [ ] **Step 7: Commit** (after user approval)

```bash
git add __fixtures__/agent-runs/nvda-challenge/ docs/phases/phase-7-challenge.md
git commit -m "feat: record the nvda-challenge fixture from a live run"
```

---

## Task 3: Mode schema and scenario selection

Two small pure pieces, both testable, both consumed by Task 4.

**Files:**
- Modify: `schemas/agent.ts`
- Modify: `schemas/agent.test.ts`
- Create: `lib/agent/scenario.ts`
- Test: `lib/agent/scenario.test.ts`

**Interfaces:**
- Consumes: `AGENT_RUN_MODES`, `AgentRunMode` from `@/schemas/agent`.
- Produces: `AgentRunModeSchema` (Zod enum); `scenarioForMode(mode: AgentRunMode): string`; constants `RESEARCH_SCENARIO`, `CHALLENGE_SCENARIO`.

- [ ] **Step 1: Write the failing tests**

Append to `schemas/agent.test.ts`:

```ts
describe("AgentRunModeSchema", () => {
  it("accepts both run modes", () => {
    expect(AgentRunModeSchema.safeParse("research").success).toBe(true);
    expect(AgentRunModeSchema.safeParse("challenge").success).toBe(true);
  });
  it("rejects anything else", () => {
    expect(AgentRunModeSchema.safeParse("bear-case").success).toBe(false);
    expect(AgentRunModeSchema.safeParse("").success).toBe(false);
    expect(AgentRunModeSchema.safeParse(undefined).success).toBe(false);
  });
});
```

and add `AgentRunModeSchema` to that file's existing import from `./agent`.

Create `lib/agent/scenario.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run schemas/agent.test.ts lib/agent/scenario.test.ts`
Expected: FAIL — `AgentRunModeSchema` is not exported; `./scenario` cannot be resolved.

- [ ] **Step 3: Write the implementations**

In `schemas/agent.ts`, below the existing `AgentRunMode` type export:

```ts
export const AgentRunModeSchema = z.enum(AGENT_RUN_MODES);
```

Create `lib/agent/scenario.ts`:

```ts
import type { AgentRunMode } from "@/schemas/agent";

// Fixture scenario per run mode. Under USE_AI_FIXTURES a challenge run carrying
// the research scenario replays research messages through the challenge loop —
// it doesn't crash, it just quietly isn't a challenge run.
export const RESEARCH_SCENARIO = "nvda-happy-path";
export const CHALLENGE_SCENARIO = "nvda-challenge";

export function scenarioForMode(mode: AgentRunMode): string {
  return mode === "challenge" ? CHALLENGE_SCENARIO : RESEARCH_SCENARIO;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run schemas/agent.test.ts lib/agent/scenario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (after user approval)

```bash
git add schemas/agent.ts schemas/agent.test.ts lib/agent/scenario.ts lib/agent/scenario.test.ts
git commit -m "feat: add run-mode schema and mode-derived fixture scenario"
```

---

## Task 4: Mode-aware trigger action and the Challenge button

**Files:**
- Modify: `app/(app)/theses/agent-actions.ts:18-31`
- Create: `components/agent/ChallengeButton.tsx`
- Modify: `app/(app)/theses/[thesisId]/page.tsx` (import + header)

**Interfaces:**
- Consumes: `AgentRunModeSchema` and `AgentRunMode` from `@/schemas/agent`; `scenarioForMode` from `@/lib/agent/scenario`; `createAgentRun(thesisId, trigger, { mode })` from `@/lib/db/repositories/agent-runs`.
- Produces: `triggerAgentRun(thesisId: string, mode?: AgentRunMode): Promise<ActionResult<{ agentRunId: string }>>`; `<ChallengeButton thesisId={string} disabled?={boolean} />`.

Note: there is no unit test here. `vitest.config.ts` collects only `lib/**` and `schemas/**`, and this task is a thin wrapper plus a client component. Its logic — mode validation and scenario selection — is already covered by Task 3. Do not add a test file under `app/` or `components/`; it would never run and would read as coverage that does not exist.

- [ ] **Step 1: Widen the server action**

In `app/(app)/theses/agent-actions.ts`, replace the whole `triggerAgentRun` function:

```ts
export async function triggerAgentRun(thesisId: string): Promise<ActionResult<{ agentRunId: string }>> {
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) return { ok: false, error: "Thesis not found" };
  const run = await createAgentRun(thesisId, "manual");
  // scenario makes fixture runs deterministic in dev; ignored by the real path.
  await inngest.send({
    name: "agent.run-requested",
    data: { agentRunId: run.id, thesisId, userId, scenario: "nvda-happy-path" },
  });
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: { agentRunId: run.id } };
}
```

with:

```ts
export async function triggerAgentRun(
  thesisId: string,
  mode: AgentRunMode = "research",
): Promise<ActionResult<{ agentRunId: string }>> {
  const userId = await requireUserId();
  const parsedMode = AgentRunModeSchema.safeParse(mode);
  if (!parsedMode.success) return { ok: false, error: "Unknown run mode" };

  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) return { ok: false, error: "Thesis not found" };

  const run = await createAgentRun(thesisId, "manual", { mode: parsedMode.data });
  // scenario makes fixture runs deterministic in dev; ignored by the real path.
  // It MUST follow the mode — a challenge run carrying the research scenario
  // replays research messages through the challenge loop without failing.
  await inngest.send({
    name: "agent.run-requested",
    data: {
      agentRunId: run.id,
      thesisId,
      userId,
      scenario: scenarioForMode(parsedMode.data),
      mode: parsedMode.data,
    },
  });
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: { agentRunId: run.id } };
}
```

Add to the imports at the top of the file:

```ts
import { AgentRunModeSchema, type AgentRunMode } from "@/schemas/agent";
import { scenarioForMode } from "@/lib/agent/scenario";
```

- [ ] **Step 2: Create the Challenge button**

Create `components/agent/ChallengeButton.tsx`. It follows `DeleteThesisButton`'s AlertDialog pattern and `AnalyzeNowButton`'s transition pattern.

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { triggerAgentRun } from "@/app/(app)/theses/agent-actions";

export function ChallengeButton({ thesisId, disabled }: { thesisId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending || disabled}>
          {pending ? "Starting…" : "Challenge"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Challenge this thesis?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent searches for evidence that would make this thesis <em>less</em> likely to hold, then
            writes up the case against it. It runs the same way an analysis does and takes about a minute.
            It may find nothing — that is a real result, not a failure.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await triggerAgentRun(thesisId, "challenge");
                if (res.ok) router.refresh();
                else toast.error(res.error);
              });
            }}
          >
            Run challenge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Copy check before moving on: no "bear case", no recommendation to act, and "may find nothing" framed as a result.

- [ ] **Step 3: Wire it into the thesis header**

In `app/(app)/theses/[thesisId]/page.tsx`, replace:

```tsx
        <AnalyzeNowButton thesisId={thesis.id} disabled={Boolean(activeRun)} />
```

with:

```tsx
        <div className="flex items-center gap-2">
          <ChallengeButton thesisId={thesis.id} disabled={Boolean(activeRun)} />
          <AnalyzeNowButton thesisId={thesis.id} disabled={Boolean(activeRun)} />
        </div>
```

Add the import beside the existing `AnalyzeNowButton` import:

```tsx
import { ChallengeButton } from "@/components/agent/ChallengeButton";
```

Both share the `Boolean(activeRun)` guard, so neither run type can start while another is in flight.

- [ ] **Step 4: Verify end to end**

```bash
npm run typecheck && npm run lint
```

Then, in two terminals with `USE_AI_FIXTURES=1` in `.env.local`:
```bash
npm run dev
npx inngest-cli dev
```
Open a thesis, click **Challenge**, confirm. Expected: the dialog closes, the run panel shows a queued/running run, and it completes. Verify it recorded the right mode and scenario:

```bash
node --env-file=.env.local -e '
const { neon } = require("./node_modules/@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
sql`select id, mode, trigger, status from agent_runs order by created_at desc limit 1`.then(r => console.log(r));
'
```
Expected: `mode: "challenge"`.

- [ ] **Step 5: Commit** (after user approval)

```bash
git add app/\(app\)/theses/agent-actions.ts components/agent/ChallengeButton.tsx \
        app/\(app\)/theses/\[thesisId\]/page.tsx
git commit -m "feat: trigger challenge runs from the thesis header"
```

---

## Task 5: Run-mode badge on the trace header

**Files:**
- Create: `lib/agent/run-mode.ts`
- Test: `lib/agent/run-mode.test.ts`
- Modify: `components/agent/trace/RunHeader.tsx`

**Interfaces:**
- Consumes: `AgentRunMode` from `@/schemas/agent`.
- Produces: `MODE_LABEL: Record<AgentRunMode, string>`; `MODE_CLASS: Record<AgentRunMode, string>`; `showsModeBadge(mode: AgentRunMode): boolean`.

- [ ] **Step 1: Write the failing test**

Create `lib/agent/run-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_RUN_MODES } from "@/schemas/agent";
import { MODE_LABEL, MODE_CLASS, showsModeBadge } from "./run-mode";

describe("run mode presentation", () => {
  it("labels every mode", () => {
    for (const mode of AGENT_RUN_MODES) {
      expect(MODE_LABEL[mode]).toBeTruthy();
      expect(MODE_CLASS[mode]).toBeTruthy();
    }
  });

  it("never uses bear-case language", () => {
    // For a short thesis the counter-case is bullish, so "bear" is wrong half
    // the time. This is a project-wide naming rule, not a style preference.
    for (const label of Object.values(MODE_LABEL)) {
      expect(label.toLowerCase()).not.toContain("bear");
    }
  });

  it("badges challenge runs only, leaving research traces unchanged", () => {
    expect(showsModeBadge("challenge")).toBe(true);
    expect(showsModeBadge("research")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/agent/run-mode.test.ts`
Expected: FAIL — cannot resolve `./run-mode`.

- [ ] **Step 3: Write the implementation**

Create `lib/agent/run-mode.ts`, mirroring the shape of `lib/agent/run-status.ts`:

```ts
import type { AgentRunMode } from "@/schemas/agent";

export const MODE_LABEL: Record<AgentRunMode, string> = {
  research: "Research",
  challenge: "Challenge",
};

// Calm, not alarming — a challenge run is considered analysis, not a warning.
// Follows the existing restraint precedent where allow-list refusals render as
// a brick chip rather than a red alert.
export const MODE_CLASS: Record<AgentRunMode, string> = {
  research: "bg-zinc-100 text-zinc-600",
  challenge: "bg-[#f4f1ee] text-[#8a5a3b]",
};

// Research runs are the default and carry no badge, so their traces look exactly
// as they did before this phase.
export function showsModeBadge(mode: AgentRunMode): boolean {
  return mode === "challenge";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/agent/run-mode.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Render the badge**

In `components/agent/trace/RunHeader.tsx`, add the imports:

```tsx
import { MODE_LABEL, MODE_CLASS, showsModeBadge } from "@/lib/agent/run-mode";
```

Then, inside the metadata row, immediately after the ticker `<span>`, add:

```tsx
          {showsModeBadge(run.mode) && (
            <span className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold ${MODE_CLASS[run.mode]}`}>
              {MODE_LABEL[run.mode]}
            </span>
          )}
```

Also change the heading so a challenge run is named for what it is. Replace:

```tsx
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Analysis run</h1>
```

with:

```tsx
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          {run.mode === "challenge" ? "Challenge run" : "Analysis run"}
        </h1>
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Then open a completed research run's trace and a challenge run's trace. Expected: the research trace is visually identical to before; the challenge trace reads "Challenge run" with a calm chip.

- [ ] **Step 7: Commit** (after user approval)

```bash
git add lib/agent/run-mode.ts lib/agent/run-mode.test.ts components/agent/trace/RunHeader.tsx
git commit -m "feat: label challenge runs on the trace header"
```

---

## Task 6: Citation resolution

The brief cites the thesis's *standing* weakening evidence, so a citation may belong to a run from weeks ago and have no card in this trace. This task builds the lookup and the pure resolver; Task 7 renders them.

**Files:**
- Modify: `lib/db/repositories/evidence.ts`
- Create: `lib/agent/brief-citations.ts`
- Test: `lib/agent/brief-citations.test.ts`

**Interfaces:**
- Consumes: `ChallengeBriefPoint` (`{ claimId, claimOrdinal, argument, evidenceIds }`) from `@/lib/ai/schemas/challenge-brief`.
- Produces: `listEvidenceByIds(ids: string[]): Promise<Evidence[]>`; `resolveBriefCitations(points, thisRunEvidenceIds, known, claimsById): ResolvedPoint[]`; types `CitationSource`, `ResolvedCitation`, `ResolvedPoint`.

- [ ] **Step 1: Write the failing test**

Create `lib/agent/brief-citations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
import { resolveBriefCitations, type CitationSource } from "./brief-citations";

const claimsById = new Map([
  ["claim-a", { statement: "Data-center revenue keeps growing" }],
  ["claim-b", { statement: "NVIDIA keeps its accelerator lead" }],
]);

const known = new Map<string, CitationSource>([
  ["ev-this", { evidenceId: "ev-this", agentRunId: "run-1", title: "Margins slipped", domain: "reuters.com" }],
  ["ev-old", { evidenceId: "ev-old", agentRunId: "run-0", title: "Rival shipped", domain: "sec.gov" }],
]);

function point(over: Partial<ChallengeBriefPoint> = {}): ChallengeBriefPoint {
  return { claimId: "claim-a", claimOrdinal: 0, argument: "Margins fell.", evidenceIds: ["ev-this"], ...over };
}

describe("resolveBriefCitations", () => {
  it("anchors evidence collected by this run", () => {
    const [resolved] = resolveBriefCitations([point()], new Set(["ev-this"]), known, claimsById);
    expect(resolved.citations).toEqual([
      { kind: "this-run", evidenceId: "ev-this", title: "Margins slipped", domain: "reuters.com" },
    ]);
  });

  it("labels evidence from an earlier run and carries its run id", () => {
    const [resolved] = resolveBriefCitations(
      [point({ evidenceIds: ["ev-old"] })],
      new Set(["ev-this"]),
      known,
      claimsById,
    );
    expect(resolved.citations).toEqual([
      { kind: "earlier-run", evidenceId: "ev-old", agentRunId: "run-0", title: "Rival shipped", domain: "sec.gov" },
    ]);
  });

  it("drops unresolvable ids rather than rendering a dead anchor", () => {
    const [resolved] = resolveBriefCitations(
      [point({ evidenceIds: ["ev-this", "ev-deleted"] })],
      new Set(["ev-this"]),
      known,
      claimsById,
    );
    expect(resolved.citations.map((c) => c.evidenceId)).toEqual(["ev-this"]);
  });

  it("keeps a point whose claim was deleted, with a null statement", () => {
    const [resolved] = resolveBriefCitations(
      [point({ claimId: "claim-gone", claimOrdinal: 7 })],
      new Set(["ev-this"]),
      known,
      claimsById,
    );
    expect(resolved.claimStatement).toBeNull();
    expect(resolved.claimOrdinal).toBe(7);
    expect(resolved.argument).toBe("Margins fell.");
  });

  it("carries the claim statement when the claim still exists", () => {
    const [resolved] = resolveBriefCitations([point({ claimId: "claim-b" })], new Set(["ev-this"]), known, claimsById);
    expect(resolved.claimStatement).toBe("NVIDIA keeps its accelerator lead");
  });

  it("preserves point order", () => {
    const resolved = resolveBriefCitations(
      [point({ argument: "first" }), point({ argument: "second" })],
      new Set(["ev-this"]),
      known,
      claimsById,
    );
    expect(resolved.map((p) => p.argument)).toEqual(["first", "second"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/agent/brief-citations.test.ts`
Expected: FAIL — cannot resolve `./brief-citations`.

- [ ] **Step 3: Write the resolver**

Create `lib/agent/brief-citations.ts`:

```ts
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";

export type CitationSource = {
  evidenceId: string;
  agentRunId: string;
  title: string;
  domain: string;
};

export type ResolvedCitation =
  | { kind: "this-run"; evidenceId: string; title: string; domain: string }
  | { kind: "earlier-run"; evidenceId: string; agentRunId: string; title: string; domain: string };

export type ResolvedPoint = {
  claimId: string;
  claimOrdinal: number;
  // null when the claim was deleted after the brief was written. The argument
  // still stands on its own, so the point is kept and rendered without a statement.
  claimStatement: string | null;
  argument: string;
  citations: ResolvedCitation[];
};

// The brief argues from the thesis's STANDING weakening evidence, not just this
// run's, so a cited item may predate this run entirely. Evidence in this run
// anchors to its card; older evidence links out to the run that found it; an id
// that resolves to nothing is dropped, because a brief must never render a dead
// anchor.
export function resolveBriefCitations(
  points: ChallengeBriefPoint[],
  thisRunEvidenceIds: ReadonlySet<string>,
  known: ReadonlyMap<string, CitationSource>,
  claimsById: ReadonlyMap<string, { statement: string }>,
): ResolvedPoint[] {
  return points.map((point) => {
    const citations: ResolvedCitation[] = [];
    for (const evidenceId of point.evidenceIds) {
      const source = known.get(evidenceId);
      if (!source) continue;
      citations.push(
        thisRunEvidenceIds.has(evidenceId)
          ? { kind: "this-run", evidenceId, title: source.title, domain: source.domain }
          : {
              kind: "earlier-run",
              evidenceId,
              agentRunId: source.agentRunId,
              title: source.title,
              domain: source.domain,
            },
      );
    }
    return {
      claimId: point.claimId,
      claimOrdinal: point.claimOrdinal,
      claimStatement: claimsById.get(point.claimId)?.statement ?? null,
      argument: point.argument,
      citations,
    };
  });
}
```

- [ ] **Step 4: Add the repository read**

In `lib/db/repositories/evidence.ts`, add the `inArray` import and the function:

```ts
import { eq, inArray } from "drizzle-orm";
```

```ts
// Evidence by id, for brief citations that belong to earlier runs than the one
// being viewed.
export async function listEvidenceByIds(ids: string[]): Promise<Evidence[]> {
  if (ids.length === 0) return [];
  return db.select().from(evidence).where(inArray(evidence.id, ids));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/agent/brief-citations.test.ts && npm run typecheck`
Expected: PASS — 6 tests; typecheck clean.

- [ ] **Step 6: Commit** (after user approval)

```bash
git add lib/agent/brief-citations.ts lib/agent/brief-citations.test.ts lib/db/repositories/evidence.ts
git commit -m "feat: resolve challenge-brief citations across runs"
```

---

## Task 7: Render the brief on the run trace

**Files:**
- Create: `components/agent/trace/ChallengeBrief.tsx`
- Modify: `components/agent/trace/EvidenceCard.tsx` (anchor id)
- Modify: `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`

**Interfaces:**
- Consumes: `resolveBriefCitations`, `ResolvedPoint`, `CitationSource` from `@/lib/agent/brief-citations`; `listEvidenceByIds` from `@/lib/db/repositories/evidence`; `getBriefForRun` from `@/lib/db/repositories/challenge-briefs`; `getSourcesByIds` from `@/lib/db/repositories/sources`; `ChallengeBriefPoint` from `@/lib/ai/schemas/challenge-brief`.
- Produces: `<ChallengeBrief headline summary points thesisId />` and `<NoChallengeBrief />`.

- [ ] **Step 1: Give evidence cards an anchor**

In `components/agent/trace/EvidenceCard.tsx`, add an `id` to the root element so brief citations can link to it. Replace:

```tsx
    <div className="my-2.5 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5">
```

with:

```tsx
    <div
      id={`evidence-${ev.id}`}
      className="my-2.5 scroll-mt-24 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5"
    >
```

`scroll-mt-24` keeps the anchored card clear of the sticky `RunHeader`.

- [ ] **Step 2: Build the brief component**

Create `components/agent/trace/ChallengeBrief.tsx`:

```tsx
import Link from "next/link";
import type { ResolvedPoint } from "@/lib/agent/brief-citations";

export function ChallengeBrief({
  headline,
  summary,
  points,
  thesisId,
}: {
  headline: string;
  summary: string;
  points: ResolvedPoint[];
  thesisId: string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-[#fcfbfa] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a5a3b]">
        The case against this thesis
      </p>
      <h2 className="mt-2 text-[17px] font-semibold leading-snug tracking-tight text-zinc-900">{headline}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{summary}</p>

      <ol className="mt-4 flex flex-col gap-3.5 border-t border-zinc-200/70 pt-4">
        {points.map((point, idx) => (
          <li key={`${point.claimId}-${idx}`}>
            <p className="text-[11px] font-medium text-zinc-400">
              Claim {point.claimOrdinal + 1}
              {point.claimStatement && <span className="text-zinc-500"> · {point.claimStatement}</span>}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">{point.argument}</p>
            {point.citations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {point.citations.map((c) =>
                  c.kind === "this-run" ? (
                    <a
                      key={c.evidenceId}
                      href={`#evidence-${c.evidenceId}`}
                      className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                    >
                      {c.domain}
                    </a>
                  ) : (
                    <Link
                      key={c.evidenceId}
                      href={`/theses/${thesisId}/runs/${c.agentRunId}#evidence-${c.evidenceId}`}
                      className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                    >
                      {c.domain} <span className="font-sans text-zinc-400">· earlier run</span>
                    </Link>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// A challenge run that found nothing is a real result, not an empty state —
// the researcher prompt explicitly permits "the thesis held up" as an answer.
export function NoChallengeBrief() {
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Result</p>
      <h2 className="mt-2 text-[15px] font-semibold tracking-tight text-zinc-900">No counter-evidence found</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
        The agent looked for material that would weaken this thesis and did not find any it could stand
        behind. The thesis held up this run.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Load and resolve the brief on the trace page**

In `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, add the imports:

```tsx
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { listEvidenceByIds } from "@/lib/db/repositories/evidence";
import { resolveBriefCitations, type CitationSource } from "@/lib/agent/brief-citations";
import { ChallengeBrief, NoChallengeBrief } from "@/components/agent/trace/ChallengeBrief";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
```

Then, after the existing `verdictsByEvidenceId` block and before `const lastIterId = ...`, insert:

```tsx
  // Challenge runs carry a brief. Its citations point at the thesis's standing
  // weakening evidence, so some may belong to earlier runs and have no card here.
  const brief = run.mode === "challenge" ? await getBriefForRun(run.id) : null;
  let resolvedPoints: ReturnType<typeof resolveBriefCitations> = [];
  if (brief) {
    const points = brief.points as ChallengeBriefPoint[];
    const citedIds = [...new Set(points.flatMap((p) => p.evidenceIds))];
    const thisRunEvidenceIds = new Set(evidence.map((e) => e.id));
    const foreignIds = citedIds.filter((id) => !thisRunEvidenceIds.has(id));
    const foreignEvidence = await listEvidenceByIds(foreignIds);
    const foreignSources = await getSourcesByIds([...new Set(foreignEvidence.map((e) => e.sourceId))]);
    const foreignSourceById = new Map(foreignSources.map((s) => [s.id, s]));

    const known = new Map<string, CitationSource>();
    for (const e of evidence) {
      const src = sourcesById.get(e.sourceId);
      if (src) known.set(e.id, { evidenceId: e.id, agentRunId: e.agentRunId, title: src.title ?? src.domain, domain: src.domain });
    }
    for (const e of foreignEvidence) {
      const src = foreignSourceById.get(e.sourceId);
      if (src) known.set(e.id, { evidenceId: e.id, agentRunId: e.agentRunId, title: src.title ?? src.domain, domain: src.domain });
    }

    resolvedPoints = resolveBriefCitations(
      points,
      thisRunEvidenceIds,
      known,
      new Map(thesis.claims.map((c) => [c.id, { statement: c.statement }])),
    );
  }
```

- [ ] **Step 4: Render it above the timeline**

In the same file, between the failure banner and the `<div className="relative mt-6 pl-[30px]">` timeline, insert:

```tsx
      {brief && (
        <ChallengeBrief
          headline={brief.headline}
          summary={brief.summary}
          points={resolvedPoints}
          thesisId={thesisId}
        />
      )}
      {run.mode === "challenge" && !brief && isTerminalStatus(run.status) && run.status !== "failed" && (
        <NoChallengeBrief />
      )}
```

The conclusion sits above the working that produced it.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test`

Then with `USE_AI_FIXTURES=1`, `npm run dev`, and `npx inngest-cli dev`: trigger a Challenge run and open its trace. Check each of these:

1. The brief renders above the iteration timeline, with headline, summary, and points.
2. Each point names its claim by number and statement.
3. A citation whose evidence is in this run scrolls to that evidence card, clear of the sticky header.
4. A citation from an earlier run links to that run's trace and is labelled "earlier run". (The seeded `nvda-happy-path` weakening link produces one, since it belongs to the demo's research run.)
5. A research run's trace shows no brief and looks exactly as it did before.

To see the no-brief state, temporarily point a challenge run at a thesis with no weakening evidence (a freshly created thesis with claims but no analysis) and confirm "No counter-evidence found" renders.

- [ ] **Step 6: Commit** (after user approval)

```bash
git add components/agent/trace/ChallengeBrief.tsx components/agent/trace/EvidenceCard.tsx \
        app/\(app\)/theses/\[thesisId\]/runs/\[runId\]/page.tsx
git commit -m "feat: render the challenge brief on the run trace"
```

---

## Task 8: Design pass and documentation

Per `CLAUDE.md`, a design pass follows every new screen — it is where the project moves from shipped to good.

**Files:**
- Modify: `components/agent/trace/ChallengeBrief.tsx`, `components/agent/trace/RunHeader.tsx`, `components/agent/ChallengeButton.tsx` (as the pass dictates)
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Re-engage the frontend-design skill**

Invoke the `frontend-design` skill and review the three new surfaces against the references in `CLAUDE.md`: Linear, Vercel's dashboard, Granola. Ask the question the project asks: *would this be at home inside Linear's product?*

Specific things to interrogate, since they were chosen in a plan rather than in front of a screen:
- The brief's warm-neutral panel (`#fcfbfa` / `#8a5a3b`). Does it read as calm and considered, or as a warning? It must be the former.
- Typographic hierarchy between headline, summary, and point arguments — three levels that must feel distinct without a size ramp alone.
- The `Challenge` / `Analyze now` pair. Does the outline button read as genuinely secondary next to the primary?
- Citation chips at `text-[11px]` — legible, or too small to click comfortably?

- [ ] **Step 2: Apply the revisions**

Make the changes the pass calls for. Keep to the locked tokens: zinc neutrals, accent `#1E3A5F`, health colours `#1F7A4D` / `#A1A1AA` / `#C0492F`.

- [ ] **Step 3: Record the decisions**

Add a `### Challenge surfaces (Phase 7b)` section to `docs/DESIGN.md`, following the existing per-screen sections. Record at minimum:
- Why the challenge run's palette is warm neutral rather than red — it is analysis, not an alarm, and it follows the allow-list-refusal precedent.
- Why the brief sits above the timeline — conclusion first, working below.
- Why the trigger is a secondary outline button rather than a menu item.
- The "no counter-evidence" state styled as a result rather than an empty state.
- Any revision the design pass produced, and what prompted it.

- [ ] **Step 4: Full verification**

```bash
node -v            # must be 22
npm run typecheck
npm run lint
npm test
```

Then walk the checklist in the spec's Verification section end to end.

- [ ] **Step 5: Commit** (after user approval)

```bash
git add components/agent docs/DESIGN.md
git commit -m "docs: record Phase 7b challenge-surface design decisions"
```

---

## Done when

- [ ] `--live` + `--thesis` on the fixture harness, with both guards, tested.
- [ ] `nvda-challenge` recorded (five files), verified, committed; README warning replaced.
- [ ] `seed-demo.ts` claim ordering fixed.
- [ ] `phase-7-challenge.md` and the scenario README corrected re: the recording command.
- [ ] `AgentRunModeSchema`; `triggerAgentRun(thesisId, mode)`; mode-derived scenario.
- [ ] `ChallengeButton` + confirmation dialog, sharing the active-run guard.
- [ ] `RunHeader` mode badge; research traces unchanged.
- [ ] `ChallengeBrief` with three-way citation resolution and the no-brief result state.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all clean.
- [ ] Design pass done; `DESIGN.md` updated.
- [ ] Every commit approved by the user before staging.

## Not in this plan (Phase 7c)

The claim drill-down route, `HealthSplit`, `ClaimEvidenceList` with per-item contribution numbers, `ClaimList` row links, `/demo` parity (seeding a challenge run and `app/demo/claims/[claimId]/page.tsx`), and the PRD/README updates describing the finished feature.
