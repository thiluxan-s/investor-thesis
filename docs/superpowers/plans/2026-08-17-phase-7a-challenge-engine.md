# Phase 7a — Challenge Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for challenge runs — the existing researcher loop can be pointed *against* a thesis, its counter-evidence is scored by the unchanged evaluator, and a new one-shot challenger agent writes a stored brief arguing the case against the thesis. No UI in this sub-phase.

**Architecture:** A `mode` enum (`research` | `challenge`) on `agent_runs` selects which system prompt and task template the researcher uses — the loop body itself is untouched. After evaluation completes, a mode-guarded Inngest step feeds the thesis's *evaluator-scored* weakening links to a new one-shot challenger agent (forced tool use, Zod-validated), which returns a brief persisted to a new `challenge_briefs` table. A new pure `claimHealthBreakdown` function splits a claim's score by the provenance of its evidence, ready for 7b's UI.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle ORM + Neon Postgres, Anthropic SDK (native tool use), Inngest, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-phase-7-challenge-design.md` — read it before starting. This plan implements spec sections 3, 4, 5, 6, 7, 9, 10, 11, and the 7a half of 12.

## Global Constraints

Every task's requirements implicitly include this section.

- **Approval gate before every commit.** This project requires it (`CLAUDE.md` §"Approval workflow"). Each task's commit step means: summarize the change in 1–3 sentences, show the diff, **wait for Thiluxan's explicit approval**, then commit. Never run `git add` or `git commit` before approval.
- **Branch:** `phase-7a-challenge-engine` (already created; the spec is committed on it).
- **Tests require Node 22.** `node --version` must print v22.x before `npm test`; vitest fails with a cryptic `styleText` error on Node 21.
- **`npm run typecheck` and `npm run lint` must pass before every commit.** No exceptions.
- **No `any`.** Use `unknown` and narrow. Never silently suppress a TypeScript error.
- **Absolute imports via `@/`.** Never `../../../lib/...`. Group external → `@/` → relative.
- **All DB access goes through `lib/db/repositories/`.** No raw Drizzle in agents, pipelines, Inngest functions, or components.
- **Never trust an AI response without Zod validation.**
- **Prompts live in `lib/ai/prompts/`**, separate from agent code, exporting a prompt-version constant where the output is persisted.
- **Naming: "challenge", never "bear case".** For a `short` thesis the counter-case is bullish, so "bear" is wrong half the time. This applies to table names, enum values, file names, identifiers, and every user-facing string. User-facing copy for the concept is "The case against this thesis".
- **`USE_AI_FIXTURES=1` is the dev default.** No task in this plan may make a live Anthropic call without Thiluxan explicitly approving it first. Agent runs cost real money.
- **Do not add dependencies.** Everything here uses what is already installed.
- **Do not modify the loop body of `runResearcher`.** Mode selects the prompt only. If a change appears to require touching the `while` loop, stop and raise it.

---

## File Structure

| File | Responsibility |
|---|---|
| `schemas/agent.ts` | *(modify)* `AGENT_RUN_MODES` tuple + `AgentRunMode` type — client-safe |
| `lib/db/schema.ts` | *(modify)* `agent_run_mode` pgEnum, `agent_runs.mode`, `challenge_briefs` table |
| `lib/db/agent-enum-sync.test.ts` | *(modify)* drift guard for the new enum |
| `lib/db/repositories/agent-runs.ts` | *(modify)* `createAgentRun` takes mode |
| `lib/db/repositories/challenge-briefs.ts` | **new** — upsert/read briefs |
| `lib/db/repositories/claim-evidence-links.ts` | *(modify)* mode-aware + weakening-link queries |
| `lib/health/score.ts` | *(modify)* `claimHealthBreakdown` — pure |
| `lib/challenge/select.ts` | **new** — pure selection/ordering/capping of brief evidence |
| `lib/ai/prompts/researcher.ts` | *(modify)* challenge system prompt + task builder |
| `lib/ai/agents/researcher.ts` | *(modify)* `mode` parameter selects the prompt pair |
| `lib/ai/schemas/challenge-brief.ts` | **new** — Zod schema for the model's output + persisted point type |
| `lib/ai/tools/return-challenge-brief.ts` | **new** — forced-tool-use definition |
| `lib/ai/prompts/challenger.ts` | **new** — system prompt, task builder, prompt version |
| `lib/ai/agents/challenger.ts` | **new** — one-shot brief writer + index→UUID mapping |
| `lib/ai/challenge-brief-fixtures.ts` | **new** — offline replay reader |
| `lib/ai/challenge-pipeline.ts` | **new** — orchestration: load links → select → write → persist |
| `lib/inngest/client.ts` | *(modify)* `mode` on the two agent-run event payloads |
| `lib/inngest/functions/run-agent.ts` | *(modify)* pass + forward mode |
| `lib/inngest/functions/evaluate-run.ts` | *(modify)* mode-guarded brief step |
| `scripts/run-agent-fixture.ts` | *(modify)* accept a mode; exercise the brief path offline |
| `__fixtures__/agent-runs/nvda-challenge/` | **new** — recorded scenario |
| `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/phases/phase-7-challenge.md` | *(modify/new)* |

---

## Task 1: Schema — run mode and challenge briefs

**Files:**
- Modify: `schemas/agent.ts`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/repositories/agent-runs.ts:7-18`
- Modify: `lib/inngest/functions/schedule-runs.ts` (caller of `createAgentRun`)
- Modify: `docs/DATA_MODEL.md`
- Test: `lib/db/agent-enum-sync.test.ts`

**Interfaces:**
- Produces: `AGENT_RUN_MODES` (readonly `["research","challenge"]`), `type AgentRunMode`, `agentRunMode` pgEnum, `challengeBriefs` table, `type ChallengeBrief`, `type NewChallengeBrief`, and `createAgentRun(thesisId: string, trigger: AgentRunTrigger, opts?: { mode?: AgentRunMode; digestBatchId?: string }): Promise<AgentRun>`.

- [ ] **Step 1: Write the failing enum drift-guard test**

Add to the existing `describe` block in `lib/db/agent-enum-sync.test.ts`, and extend both import lines:

```ts
import { AGENT_RUN_STATUSES, AGENT_RUN_TRIGGERS, AGENT_RUN_MODES } from "@/schemas/agent";
import { agentRunStatus, agentRunTrigger, agentRunMode } from "@/lib/db/schema";

  it("agent_run_mode", () => {
    expect([...agentRunMode.enumValues]).toEqual([...AGENT_RUN_MODES]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --version` (confirm v22.x), then `npx vitest run lib/db/agent-enum-sync.test.ts`
Expected: FAIL — `AGENT_RUN_MODES` and `agentRunMode` are not exported.

- [ ] **Step 3: Add the client-safe tuple**

In `schemas/agent.ts`, beside the existing tuples:

```ts
export const AGENT_RUN_MODES = ["research", "challenge"] as const;
export type AgentRunMode = (typeof AGENT_RUN_MODES)[number];
```

- [ ] **Step 4: Add the pgEnum and the column**

In `lib/db/schema.ts`, beside `agentRunTrigger`:

```ts
export const agentRunMode = pgEnum("agent_run_mode", ["research", "challenge"]);
```

Then add to the `agentRuns` table definition, directly after the `trigger` column:

```ts
    // Orthogonal to `trigger`: trigger records WHO started the run, mode records
    // WHAT it was looking for. Defaulting to 'research' correctly backfills every
    // pre-Phase-7 row.
    mode: agentRunMode("mode").notNull().default("research"),
```

- [ ] **Step 5: Add the `challenge_briefs` table**

In `lib/db/schema.ts`, after the `thesisHealthSnapshots` definition (it references `agentRuns` and `theses`, both defined above):

```ts
export const challengeBriefs = pgTable(
  "challenge_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    summary: text("summary").notNull(),
    // ChallengeBriefPoint[] — see lib/ai/schemas/challenge-brief.ts
    points: jsonb("points").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("challenge_briefs_run_idx").on(t.agentRunId),
    index("challenge_briefs_thesis_created_idx").on(t.thesisId, t.createdAt),
  ],
);

export type ChallengeBrief = typeof challengeBriefs.$inferSelect;
export type NewChallengeBrief = typeof challengeBriefs.$inferInsert;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/db/agent-enum-sync.test.ts`
Expected: PASS — all three enum assertions.

- [ ] **Step 7: Thread mode through `createAgentRun`**

Replace the function at `lib/db/repositories/agent-runs.ts:7-18`. The third positional parameter becomes an options object — with two orthogonal optional inputs, positional arguments would be ambiguous at every call site:

```ts
import type { AgentRunStatus, AgentRunTrigger, AgentRunMode } from "@/schemas/agent";

export async function createAgentRun(
  thesisId: string,
  trigger: AgentRunTrigger,
  opts: { mode?: AgentRunMode; digestBatchId?: string } = {},
): Promise<AgentRun> {
  const [row] = await db
    .insert(agentRuns)
    .values({
      thesisId,
      trigger,
      status: "queued",
      mode: opts.mode ?? "research",
      digestBatchId: opts.digestBatchId ?? null,
    })
    .returning();
  return row;
}
```

- [ ] **Step 8: Update the one caller that passes a batch id**

Run: `grep -rn "createAgentRun(" --include="*.ts" app lib scripts`

Every call passing a third argument must become `{ digestBatchId: <id> }`. In `lib/inngest/functions/schedule-runs.ts` that is the batch-id call; two-argument calls in `app/(app)/theses/agent-actions.ts` and `scripts/run-agent-fixture.ts` need no change yet.

- [ ] **Step 9: Generate and apply the migration**

Run: `npm run db:generate` then `npm run db:migrate`
Expected: one new migration file in `drizzle/` adding the enum type, the `mode` column with its default, and the `challenge_briefs` table. Read the generated SQL before applying — confirm `mode` is `NOT NULL DEFAULT 'research'` and that no existing column is altered or dropped.

- [ ] **Step 10: Document the schema**

In `docs/DATA_MODEL.md`, add an `agent_runs.mode` row to the `### agent_runs` table section explaining the mode/trigger distinction, and a new `### challenge_briefs` section after `### claim_evidence_links` covering the columns, the unique constraint on `agent_run_id`, why `thesis_id` is denormalised (matches `thesis_health_snapshots`), and the cascade behaviour. In the `## pgvector setup` section, add one honest sentence: `evidence.extracted_text_embedding` is declared but not yet written or read — reserved for planned dedup.

- [ ] **Step 11: Verify the whole suite and types**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 12: Summarize, get approval, then commit**

Summarize the change, show `git diff` plus the generated migration, and **wait for explicit approval**. Then:

```bash
git add schemas/agent.ts lib/db/schema.ts lib/db/agent-enum-sync.test.ts \
  lib/db/repositories/agent-runs.ts lib/inngest/functions/schedule-runs.ts \
  drizzle/ docs/DATA_MODEL.md
git commit -m "feat: add agent run mode and challenge_briefs table"
```

---

## Task 2: Health breakdown by run provenance

**Files:**
- Modify: `lib/health/score.ts`
- Test: `lib/health/score.test.ts`

**Interfaces:**
- Consumes: `AgentRunMode` (Task 1).
- Produces: `type ModedLink`, `type HealthBreakdown`, `claimHealthBreakdown(links: ModedLink[], now: Date): HealthBreakdown`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/health/score.test.ts`, extending the import from `./score`:

```ts
import { claimHealth, claimHealthBreakdown, type ModedLink } from "./score";

describe("claimHealthBreakdown", () => {
  const now = new Date("2026-08-17T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const links: ModedLink[] = [
    { impact: "strengthens", confidence: 0.8, createdAt: daysAgo(10), runMode: "research" },
    { impact: "strengthens", confidence: 0.6, createdAt: daysAgo(20), runMode: "research" },
    { impact: "weakens", confidence: 0.9, createdAt: daysAgo(5), runMode: "challenge" },
  ];

  it("overall is exactly claimHealth over all links", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.overall).toBe(claimHealth(links, now));
  });

  it("splits scores and counts by run mode", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.research.count).toBe(2);
    expect(b.challenge.count).toBe(1);
    expect(b.research.score).toBeGreaterThan(0);
    expect(b.challenge.score).toBeLessThan(0);
  });

  it("sub-scores are independent averages, not components that sum to overall", () => {
    const b = claimHealthBreakdown(links, now);
    expect(b.research.score + b.challenge.score).not.toBeCloseTo(b.overall, 5);
  });

  it("reports an absent mode as count 0 and score 0", () => {
    const researchOnly = links.filter((l) => l.runMode === "research");
    const b = claimHealthBreakdown(researchOnly, now);
    expect(b.challenge).toEqual({ score: 0, count: 0 });
    expect(b.overall).toBe(b.research.score);
  });

  it("returns all zeros for no links", () => {
    expect(claimHealthBreakdown([], now)).toEqual({
      overall: 0,
      research: { score: 0, count: 0 },
      challenge: { score: 0, count: 0 },
    });
  });

  it("decays within each subset", () => {
    const recent: ModedLink[] = [{ impact: "weakens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" }];
    const old: ModedLink[] = [{ impact: "weakens", confidence: 1, createdAt: daysAgo(400), runMode: "challenge" }];
    const mixed = [...recent, { impact: "strengthens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" } as ModedLink];
    const mixedOld = [...old, { impact: "strengthens", confidence: 1, createdAt: daysAgo(1), runMode: "challenge" } as ModedLink];
    // The old weakening item is decayed, so it drags the score down less.
    expect(claimHealthBreakdown(mixedOld, now).challenge.score).toBeGreaterThan(
      claimHealthBreakdown(mixed, now).challenge.score,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/health/score.test.ts`
Expected: FAIL — `claimHealthBreakdown` is not exported.

- [ ] **Step 3: Implement the function**

Append to `lib/health/score.ts`, adding the import at the top:

```ts
import type { AgentRunMode } from "@/schemas/agent";

export type ModedLink = {
  impact: EvidenceImpact;
  confidence: number;
  createdAt: Date;
  runMode: AgentRunMode;
};

export type HealthBreakdown = {
  overall: number;
  research: { score: number; count: number };
  challenge: { score: number; count: number };
};

// `overall` is the authoritative score (identical to claimHealth over every
// link). The per-mode scores are independent weighted averages over their own
// subsets — they deliberately do NOT sum to `overall`. The UI must present them
// as "what each line of inquiry found", never as components of the total.
export function claimHealthBreakdown(links: ModedLink[], now: Date): HealthBreakdown {
  const research = links.filter((l) => l.runMode === "research");
  const challenge = links.filter((l) => l.runMode === "challenge");
  return {
    overall: claimHealth(links, now),
    research: { score: claimHealth(research, now), count: research.length },
    challenge: { score: claimHealth(challenge, now), count: challenge.length },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/health/score.test.ts`
Expected: PASS, including the pre-existing `claimHealth` / `thesisHealth` / `decayWeight` tests.

- [ ] **Step 5: Verify types and lint**

Run: `npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 6: Summarize, get approval, then commit**

```bash
git add lib/health/score.ts lib/health/score.test.ts
git commit -m "feat: split claim health by run provenance"
```

---

## Task 3: Challenge mode on the researcher

**Files:**
- Modify: `lib/ai/prompts/researcher.ts`
- Modify: `lib/ai/agents/researcher.ts:44-64`
- Test: `lib/ai/agents/researcher.test.ts`

**Interfaces:**
- Consumes: `AgentRunMode` (Task 1).
- Produces: `challengeSystemPrompt`, `buildChallengeTask(thesis, claims, seenSourceUrls): string`, and `runResearcher(thesis, claims, seenSourceUrls, deps, scenario, mode?: AgentRunMode)`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/ai/agents/researcher.test.ts`, extending the imports:

```ts
import { challengeSystemPrompt, buildChallengeTask, systemPrompt } from "@/lib/ai/prompts/researcher";

describe("runResearcher challenge mode", () => {
  it("defaults to the research prompt", async () => {
    const d = deps([returnResultMsg([])]);
    await runResearcher(thesis, claims, [], d, "test");
    const call = (d.client.createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.system).toBe(systemPrompt);
  });

  it("uses the challenge prompt and task when mode is challenge", async () => {
    const d = deps([returnResultMsg([])]);
    await runResearcher(thesis, claims, [], d, "test", "challenge");
    const call = (d.client.createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.system).toBe(challengeSystemPrompt);
    expect(call.messages[0].content).toBe(buildChallengeTask(thesis, claims, []));
  });

  it("keeps loop behaviour identical in challenge mode", async () => {
    const many = Array.from({ length: 13 }, () => toolMsg("web_search", { query: "x" }));
    const d = deps(many);
    const res = await runResearcher(thesis, claims, [], d, "test", "challenge");
    expect(res.status).toBe("partial");
    expect(d.client.createMessage).toHaveBeenCalledTimes(12);
  });
});

describe("buildChallengeTask", () => {
  it("names the position direction so the model inverts for shorts", () => {
    const shortThesis = { ...thesis, positionDirection: "short" };
    expect(buildChallengeTask(shortThesis, claims, [])).toContain("short");
  });

  it("lists claims zero-based and includes seen sources", () => {
    const task = buildChallengeTask(thesis, claims, ["https://reuters.com/a"]);
    expect(task).toContain("0. Revenue grows");
    expect(task).toContain("https://reuters.com/a");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/agents/researcher.test.ts`
Expected: FAIL — `challengeSystemPrompt` / `buildChallengeTask` are not exported.

- [ ] **Step 3: Write the challenge prompt**

Append to `lib/ai/prompts/researcher.ts`. Same agent, different mode — keeping both prompts adjacent makes the contrast legible:

```ts
export const challengeSystemPrompt = `You are a research agent for an investment-thesis tracker, working in CHALLENGE mode. Your job is to GATHER evidence that would make the user's thesis LESS likely to be true — not to judge it. A separate evaluator scores whatever you find.

Tools:
- web_search(query, limit?) — find candidate pages.
- web_fetch(url) — read an allow-listed page as markdown. Only reputable news, investor-relations, and SEC/EDGAR domains are allowed; others are refused, so prefer those sources.
- edgar(ticker, formType?) — list a company's recent SEC filings, then web_fetch a filing url to read it.
- return_result(evidence) — call once when done, with the evidence you gathered.

What to look for — material that undercuts the claims, such as:
- competitor wins, share loss, or a credible new entrant
- margin compression, pricing pressure, or deteriorating unit economics
- guidance cuts, demand softness, or order cancellations
- litigation, regulatory action, or accounting concerns
- insider selling, executive departures, or execution slips
- analyst downgrades that cite specific, checkable reasons

Direction matters: the task states whether the user is LONG or SHORT. Disconfirming evidence for a LONG thesis is bearish; for a SHORT thesis it is BULLISH. Search accordingly — do not assume bad news is always the answer.

How to work:
- Search and read across a few independent, reputable sources. Skip URLs already in the "Already seen" list.
- For each genuinely relevant finding, capture the specific passage as extracted_text and tag which claim numbers it bears on (claim_indices, zero-based).
- DO NOT MANUFACTURE A COUNTER-CASE. If the recent record genuinely supports the thesis, return what you found — including an empty list. "The thesis held up" is a correct and acceptable result. Never stretch a weak or unrelated story into a counter-argument, and never invent sources.
- Be efficient: a handful of well-chosen sources beats exhaustive browsing. When you have enough, call return_result.`;

export function buildChallengeTask(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { statement: string }[],
  seenSourceUrls: string[],
): string {
  const claimList = claims.map((c, i) => `${i}. ${c.statement}`).join("\n");
  const seen = seenSourceUrls.length ? seenSourceUrls.join("\n") : "(none yet)";
  const disconfirming =
    thesis.positionDirection === "short"
      ? "evidence that the company is doing BETTER than this short thesis assumes"
      : "evidence that the company is doing WORSE than this long thesis assumes";
  return `Thesis: ${thesis.title}
Ticker: ${thesis.ticker} | Position: ${thesis.positionDirection} | Horizon: ${thesis.timeHorizon}

Claims (zero-based — use these indices in claim_indices):
${claimList}

Already seen sources (skip these):
${seen}

Find recent ${disconfirming} — material that would weaken these claims. If the record genuinely supports the thesis, say so by returning an empty list. Then call return_result.`;
}
```

- [ ] **Step 4: Add the mode parameter to the loop**

In `lib/ai/agents/researcher.ts`, extend the prompt import and the signature. **The `while` body is not touched.**

```ts
import type { AgentRunMode } from "@/schemas/agent";
import {
  systemPrompt,
  buildResearchTask,
  challengeSystemPrompt,
  buildChallengeTask,
} from "@/lib/ai/prompts/researcher";

export async function runResearcher(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { statement: string }[],
  seenSourceUrls: string[],
  deps: ResearcherDeps,
  _scenario: string,
  mode: AgentRunMode = "research",
): Promise<ResearcherResult> {
  const tools = toAnthropicTools(TOOLS) as { name: string; description: string; input_schema: unknown }[];
  const runTool = deps.toolRunner ?? executeToolCallSafely;
  // Mode selects the prompt pair; the loop below is identical for both.
  const activeSystem = mode === "challenge" ? challengeSystemPrompt : systemPrompt;
  const buildTask = mode === "challenge" ? buildChallengeTask : buildResearchTask;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildTask(thesis, claims, seenSourceUrls) },
  ];
```

Then change the single `createMessage` call inside the loop (currently `lib/ai/agents/researcher.ts:64`) from `system: systemPrompt` to `system: activeSystem`. Nothing else in the loop changes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/agents/researcher.test.ts`
Expected: PASS — the new cases plus every pre-existing loop test.

- [ ] **Step 6: Verify types and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Summarize, get approval, then commit**

```bash
git add lib/ai/prompts/researcher.ts lib/ai/agents/researcher.ts lib/ai/agents/researcher.test.ts
git commit -m "feat: add challenge mode to the researcher loop"
```

---

## Task 4: Challenge-brief schema and tool

**Files:**
- Create: `lib/ai/schemas/challenge-brief.ts`
- Create: `lib/ai/tools/return-challenge-brief.ts`
- Test: `lib/ai/schemas/challenge-brief.test.ts`

**Interfaces:**
- Produces: `ChallengeBriefSchema`, `type ChallengeBriefOutput` (the model's index-based output), `type ChallengeBriefPoint` (the persisted, UUID-resolved shape), `returnChallengeBriefTool`.

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/schemas/challenge-brief.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ChallengeBriefSchema } from "./challenge-brief";

const valid = {
  headline: "Margin pressure is showing up before the revenue slowdown",
  summary: "Two independent sources report gross-margin compression this quarter.",
  points: [{ claim_index: 0, argument: "Gross margin fell 200bps QoQ.", evidence_indices: [0, 1] }],
};

describe("ChallengeBriefSchema", () => {
  it("accepts a well-formed brief", () => {
    expect(ChallengeBriefSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a brief with no points (caller treats it as no brief)", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, points: [] }).success).toBe(true);
  });

  it("rejects a negative claim index", () => {
    const bad = { ...valid, points: [{ ...valid.points[0], claim_index: -1 }] };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer evidence index", () => {
    const bad = { ...valid, points: [{ ...valid.points[0], evidence_indices: [1.5] }] };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an over-long headline", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, headline: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects more than five points", () => {
    const bad = { ...valid, points: Array.from({ length: 6 }, () => valid.points[0]) };
    expect(ChallengeBriefSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(ChallengeBriefSchema.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/schemas/challenge-brief.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

Create `lib/ai/schemas/challenge-brief.ts`:

```ts
import { z } from "zod";

// What the model returns. Indices are zero-based into the ordinal-ordered claim
// list and the numbered evidence list supplied in the task — the same convention
// the researcher already uses for claim_indices. Asking the model to echo UUIDs
// is error-prone and bloats the payload.
export const ChallengeBriefPointSchema = z.object({
  claim_index: z.number().int().min(0),
  argument: z.string().min(1),
  evidence_indices: z.array(z.number().int().min(0)),
});

export const ChallengeBriefSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1),
  points: z.array(ChallengeBriefPointSchema).max(5),
});

export type ChallengeBriefOutput = z.infer<typeof ChallengeBriefSchema>;

// What we persist to challenge_briefs.points, after resolving indices to ids.
export type ChallengeBriefPoint = {
  claimId: string;
  claimOrdinal: number;
  argument: string;
  evidenceIds: string[];
};
```

- [ ] **Step 4: Write the tool definition**

Create `lib/ai/tools/return-challenge-brief.ts`, mirroring `return-evaluation.ts`:

```ts
import "server-only";
import { ChallengeBriefSchema, type ChallengeBriefOutput } from "@/lib/ai/schemas/challenge-brief";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the challenger; execute() is a no-op echo so the
// tool conforms to the Tool interface.
export const returnChallengeBriefTool: Tool<ChallengeBriefOutput> = {
  name: "return_challenge_brief",
  description:
    "Return the case against this thesis, argued only from the numbered evidence supplied. Cite evidence " +
    "indices for every point. Describe what the evidence shows — do not recommend buying, selling, or " +
    "holding, and do not estimate how likely the thesis is to fail.",
  inputSchema: ChallengeBriefSchema,
  async execute(input: ChallengeBriefOutput): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/schemas/challenge-brief.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Verify types and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Summarize, get approval, then commit**

```bash
git add lib/ai/schemas/challenge-brief.ts lib/ai/schemas/challenge-brief.test.ts lib/ai/tools/return-challenge-brief.ts
git commit -m "feat: add challenge brief schema and forced-output tool"
```

---

## Task 5: The challenger agent

**Files:**
- Create: `lib/ai/prompts/challenger.ts`
- Create: `lib/ai/agents/challenger.ts`
- Test: `lib/ai/agents/challenger.test.ts`

**Interfaces:**
- Consumes: `ChallengeBriefSchema`, `ChallengeBriefPoint` (Task 4); `EVALUATOR_MODEL`, `AnthropicLike` from `@/lib/ai/client`.
- Produces: `CHALLENGER_PROMPT_VERSION` (`"challenge-v1"`), `type BriefEvidenceItem`, `type ChallengeBriefResult`, `writeChallengeBrief(thesis, claims, items, deps): Promise<ChallengeBriefResult | null>`.

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/agents/challenger.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { writeChallengeBrief, type BriefEvidenceItem } from "./challenger";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: vi.fn(async () =>
      ({
        content: [{ type: "tool_use", name: "return_challenge_brief", id: "t1", input }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as unknown as Anthropic.Message,
    ),
  };
}

const thesis = { title: "Long NVDA", ticker: "NVDA", positionDirection: "long", timeHorizon: "months" };
const claims = [
  { id: "claim-a", ordinal: 0, statement: "Data-center revenue keeps growing" },
  { id: "claim-b", ordinal: 1, statement: "CUDA is a durable moat" },
];
const items: BriefEvidenceItem[] = [
  { evidenceId: "ev-1", claimId: "claim-a", claimOrdinal: 0, extractedText: "Orders slipped.", confidence: 0.7, ageDays: 5 },
  { evidenceId: "ev-2", claimId: "claim-b", claimOrdinal: 1, extractedText: "Rival toolkit shipped.", confidence: 0.6, ageDays: 12 },
];

const good = {
  headline: "Order slippage undercuts the growth claim",
  summary: "Two sources point at softening demand.",
  points: [{ claim_index: 0, argument: "Orders slipped this quarter.", evidence_indices: [0] }],
};

describe("writeChallengeBrief", () => {
  it("resolves indices to claim and evidence ids", async () => {
    const client = clientReturning(good);
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res).not.toBeNull();
    expect(res!.headline).toBe(good.headline);
    expect(res!.points).toEqual([
      { claimId: "claim-a", claimOrdinal: 0, argument: "Orders slipped this quarter.", evidenceIds: ["ev-1"] },
    ]);
  });

  it("forces the tool, disables thinking, and uses the evaluator model", async () => {
    const client = clientReturning(good);
    await writeChallengeBrief(thesis, claims, items, { client });
    const call = (client.createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.toolChoice).toEqual({ type: "tool", name: "return_challenge_brief" });
    expect(call.thinking).toBe(false);
    expect(call.model).toBe("claude-sonnet-4-6");
  });

  it("drops an out-of-range evidence index but keeps the point", async () => {
    const client = clientReturning({
      ...good,
      points: [{ claim_index: 0, argument: "Orders slipped.", evidence_indices: [0, 99] }],
    });
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res!.points[0].evidenceIds).toEqual(["ev-1"]);
  });

  it("drops a point whose claim index is out of range", async () => {
    const client = clientReturning({
      ...good,
      points: [
        { claim_index: 0, argument: "Kept.", evidence_indices: [0] },
        { claim_index: 9, argument: "Dropped.", evidence_indices: [1] },
      ],
    });
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res!.points).toHaveLength(1);
    expect(res!.points[0].argument).toBe("Kept.");
  });

  it("returns null when the model output fails validation", async () => {
    const client = clientReturning({ headline: "", summary: "x", points: [] });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("returns null when every point is dropped", async () => {
    const client = clientReturning({
      ...good,
      points: [{ claim_index: 42, argument: "Dropped.", evidence_indices: [0] }],
    });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("returns null when the model returns no points at all", async () => {
    const client = clientReturning({ ...good, points: [] });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/agents/challenger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the prompt**

Create `lib/ai/prompts/challenger.ts`:

```ts
// Bump when the prompt below changes — stored on each brief row so stale briefs
// are identifiable. (lib/db/repositories/challenge-briefs.ts)
export const CHALLENGER_PROMPT_VERSION = "challenge-v1";

export const systemPrompt = `You write the case AGAINST an investment thesis, for a thesis-tracking tool. The user wrote the thesis; your job is to show them, plainly, what the evidence says against it — so they can think clearly rather than only see confirmation.

You are given the thesis, its numbered claims, and a numbered list of evidence that a separate evaluator has already judged to WEAKEN one of those claims. Every item you are shown survived that independent check.

Rules:
- Argue ONLY from the numbered evidence. Do not use outside knowledge of the company, and do not speculate beyond what a passage says.
- Cite evidence indices for every point. A point with no evidence is not a point.
- At most 5 points, one per distinct line of attack. Group related items rather than repeating yourself.
- Be specific and concrete: name the number, the quarter, the competitor, the filing. Vague pessimism is worthless.
- Stay descriptive. Do NOT recommend buying, selling, holding, or resizing a position. Do NOT estimate a probability that the thesis is wrong. You describe the case against; the user decides what to do about it.
- If the evidence is thin, say so plainly in the summary rather than inflating it.
- The headline is one line naming the strongest single problem. The summary is 2-4 sentences.
- You MUST respond by calling the return_challenge_brief tool.`;

export function buildChallengeBriefTask(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { ordinal: number; statement: string }[],
  items: { extractedText: string; sourceDomain?: string; claimOrdinal: number; confidence: number; ageDays: number }[],
): string {
  const claimList = claims.map((c, i) => `${i}. ${c.statement}`).join("\n");
  const evidenceList = items
    .map(
      (it, i) =>
        `[${i}] weakens claim ${it.claimOrdinal} | confidence ${it.confidence.toFixed(2)} | ${it.ageDays} days old${
          it.sourceDomain ? ` | source: ${it.sourceDomain}` : ""
        }\n${it.extractedText}`,
    )
    .join("\n\n");
  return `Thesis: ${thesis.title}
Ticker: ${thesis.ticker} | Position: ${thesis.positionDirection} | Horizon: ${thesis.timeHorizon}

Claims (zero-based — use these indices in claim_index):
${claimList}

Evidence judged to weaken these claims (zero-based — use these indices in evidence_indices):
${evidenceList}

Write the case against this thesis, then call return_challenge_brief.`;
}
```

- [ ] **Step 4: Write the agent**

Create `lib/ai/agents/challenger.ts`:

```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { ChallengeBriefSchema, type ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
import { returnChallengeBriefTool } from "@/lib/ai/tools/return-challenge-brief";
import { systemPrompt, buildChallengeBriefTask } from "@/lib/ai/prompts/challenger";

const tools = [
  {
    name: returnChallengeBriefTool.name,
    description: returnChallengeBriefTool.description,
    input_schema: z.toJSONSchema(returnChallengeBriefTool.inputSchema) as unknown,
  },
];

export type BriefEvidenceItem = {
  evidenceId: string;
  claimId: string;
  claimOrdinal: number;
  extractedText: string;
  sourceDomain?: string;
  confidence: number;
  ageDays: number;
};

export type ChallengeBriefResult = {
  headline: string;
  summary: string;
  points: ChallengeBriefPoint[];
};

// One-shot, no loop — same mechanical shape as the evaluator and drafter.
// Returns null when there is nothing citable to store: a malformed response, or
// a response whose points all reference claims/evidence that don't exist. A
// missing brief must never discard the evidence that has already been persisted.
export async function writeChallengeBrief(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { id: string; ordinal: number; statement: string }[],
  items: BriefEvidenceItem[],
  deps: { client: AnthropicLike },
): Promise<ChallengeBriefResult | null> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildChallengeBriefTask(thesis, claims, items) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_challenge_brief" },
    thinking: false,
    maxTokens: 2048,
  });

  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" &&
      (b as { name?: string }).name === "return_challenge_brief",
  );
  const parsed = ChallengeBriefSchema.safeParse(toolUse?.input);
  if (!parsed.success) return null;

  // Resolve model-supplied indices to ids. Out-of-range references are dropped
  // rather than fatal: a hallucinated index shouldn't void an otherwise sound brief.
  const points: ChallengeBriefPoint[] = [];
  for (const p of parsed.data.points) {
    const claim = claims[p.claim_index];
    if (!claim) continue;
    const evidenceIds = p.evidence_indices
      .map((i) => items[i]?.evidenceId)
      .filter((id): id is string => Boolean(id));
    if (evidenceIds.length === 0) continue;
    points.push({ claimId: claim.id, claimOrdinal: claim.ordinal, argument: p.argument, evidenceIds });
  }
  if (points.length === 0) return null;

  return { headline: parsed.data.headline, summary: parsed.data.summary, points };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/agents/challenger.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Verify types and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Summarize, get approval, then commit**

```bash
git add lib/ai/prompts/challenger.ts lib/ai/agents/challenger.ts lib/ai/agents/challenger.test.ts
git commit -m "feat: add challenger agent that writes the case against a thesis"
```

---

## Task 6: Evidence selection and repositories

**Files:**
- Create: `lib/challenge/select.ts`
- Create: `lib/db/repositories/challenge-briefs.ts`
- Modify: `lib/db/repositories/claim-evidence-links.ts`
- Test: `lib/challenge/select.test.ts`

**Interfaces:**
- Consumes: `decayWeight` from `@/lib/health/score`; `challengeBriefs` (Task 1); `ChallengeBriefPoint` (Task 4).
- Produces: `BRIEF_EVIDENCE_CAP` (20), `type WeakeningLink`, `type SelectedEvidence`, `selectBriefEvidence(links, now, cap?)`; `upsertBrief`, `getBriefForRun`, `getLatestBriefForThesis`; `listWeakeningLinksForThesis(thesisId)`, `listLinksForClaimWithMode(claimId)`.

- [ ] **Step 1: Write the failing selection tests**

Create `lib/challenge/select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectBriefEvidence, BRIEF_EVIDENCE_CAP, type WeakeningLink } from "./select";

const now = new Date("2026-08-17T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function link(over: Partial<WeakeningLink> & { evidenceId: string }): WeakeningLink {
  return {
    claimId: "claim-a",
    claimOrdinal: 0,
    confidence: 0.5,
    createdAt: daysAgo(1),
    extractedText: "text",
    ...over,
  };
}

describe("selectBriefEvidence", () => {
  it("returns an empty list for no links", () => {
    expect(selectBriefEvidence([], now)).toEqual([]);
  });

  it("orders by weight (confidence x decay), not recency", () => {
    const strongOld = link({ evidenceId: "old", confidence: 0.9, createdAt: daysAgo(30) });
    const weakNew = link({ evidenceId: "new", confidence: 0.1, createdAt: daysAgo(1) });
    const out = selectBriefEvidence([weakNew, strongOld], now);
    expect(out.map((o) => o.evidenceId)).toEqual(["old", "new"]);
  });

  it("lets heavy decay outrank raw confidence", () => {
    const staleStrong = link({ evidenceId: "stale", confidence: 0.9, createdAt: daysAgo(720) });
    const freshMid = link({ evidenceId: "fresh", confidence: 0.5, createdAt: daysAgo(1) });
    const out = selectBriefEvidence([staleStrong, freshMid], now);
    expect(out[0].evidenceId).toBe("fresh");
  });

  it("caps the result", () => {
    const many = Array.from({ length: 30 }, (_, i) => link({ evidenceId: `e${i}` }));
    expect(selectBriefEvidence(many, now)).toHaveLength(BRIEF_EVIDENCE_CAP);
    expect(selectBriefEvidence(many, now, 5)).toHaveLength(5);
  });

  it("breaks ties deterministically by evidence id", () => {
    const a = link({ evidenceId: "b-id" });
    const b = link({ evidenceId: "a-id" });
    expect(selectBriefEvidence([a, b], now).map((o) => o.evidenceId)).toEqual(["a-id", "b-id"]);
  });

  it("exposes ageDays for the prompt", () => {
    const out = selectBriefEvidence([link({ evidenceId: "e", createdAt: daysAgo(7) })], now);
    expect(out[0].ageDays).toBe(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/challenge/select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure selection**

Create `lib/challenge/select.ts`. Mirrors the existing `lib/digest/select.ts` precedent — selection logic stays pure and testable, away from DB and model code:

```ts
import { decayWeight } from "@/lib/health/score";

// Bounds the challenger's context. Twenty weakening items is far more than a
// 5-point brief can use, so the cap costs nothing in argument quality.
export const BRIEF_EVIDENCE_CAP = 20;

export type WeakeningLink = {
  evidenceId: string;
  claimId: string;
  claimOrdinal: number;
  confidence: number;
  createdAt: Date;
  extractedText: string;
  sourceDomain?: string;
};

export type SelectedEvidence = WeakeningLink & { weight: number; ageDays: number };

// Rank by the same weight the health score uses, so the brief argues from the
// evidence that is actually moving the number. Ties break by id to keep the
// prompt (and therefore the fixture) stable across runs.
export function selectBriefEvidence(
  links: WeakeningLink[],
  now: Date,
  cap: number = BRIEF_EVIDENCE_CAP,
): SelectedEvidence[] {
  return links
    .map((l) => {
      const ageMs = Math.max(0, now.getTime() - new Date(l.createdAt).getTime());
      return {
        ...l,
        weight: l.confidence * decayWeight(ageMs),
        ageDays: Math.floor(ageMs / 86_400_000),
      };
    })
    .sort((a, b) => b.weight - a.weight || a.evidenceId.localeCompare(b.evidenceId))
    .slice(0, cap);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/challenge/select.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the challenge-briefs repository**

Create `lib/db/repositories/challenge-briefs.ts`:

```ts
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { challengeBriefs, type ChallengeBrief } from "@/lib/db/schema";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";

// Upsert on agentRunId so an Inngest step re-delivery rewrites one row.
export async function upsertBrief(input: {
  agentRunId: string;
  thesisId: string;
  headline: string;
  summary: string;
  points: ChallengeBriefPoint[];
  promptVersion: string;
}): Promise<void> {
  await db
    .insert(challengeBriefs)
    .values(input)
    .onConflictDoUpdate({
      target: challengeBriefs.agentRunId,
      set: {
        headline: input.headline,
        summary: input.summary,
        points: input.points,
        promptVersion: input.promptVersion,
        updatedAt: new Date(),
      },
    });
}

export async function getBriefForRun(agentRunId: string): Promise<ChallengeBrief | null> {
  const [row] = await db
    .select()
    .from(challengeBriefs)
    .where(eq(challengeBriefs.agentRunId, agentRunId))
    .limit(1);
  return row ?? null;
}

export async function getLatestBriefForThesis(thesisId: string): Promise<ChallengeBrief | null> {
  const [row] = await db
    .select()
    .from(challengeBriefs)
    .where(eq(challengeBriefs.thesisId, thesisId))
    .orderBy(desc(challengeBriefs.createdAt))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 6: Add the mode-aware link queries**

Append to `lib/db/repositories/claim-evidence-links.ts`, extending its imports:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { claimEvidenceLinks, claims, evidence, agentRuns, sources, type ClaimEvidenceLink } from "@/lib/db/schema";
import type { AgentRunMode } from "@/schemas/agent";
import type { WeakeningLink } from "@/lib/challenge/select";

// Links for one claim, carrying the mode of the run that produced the evidence.
// Powers the per-claim health split (lib/health/score.ts claimHealthBreakdown).
export async function listLinksForClaimWithMode(
  claimId: string,
): Promise<(ClaimEvidenceLink & { runMode: AgentRunMode })[]> {
  const rows = await db
    .select({ link: claimEvidenceLinks, runMode: agentRuns.mode })
    .from(claimEvidenceLinks)
    .innerJoin(evidence, eq(claimEvidenceLinks.evidenceId, evidence.id))
    .innerJoin(agentRuns, eq(evidence.agentRunId, agentRuns.id))
    .where(eq(claimEvidenceLinks.claimId, claimId));
  return rows.map((r) => ({ ...r.link, runMode: r.runMode }));
}

// Every weakening link across a thesis's claims — the challenger's input. Scoped
// to the thesis rather than one run so the brief argues the standing case, not
// just what the latest run happened to collect.
export async function listWeakeningLinksForThesis(thesisId: string): Promise<WeakeningLink[]> {
  const rows = await db
    .select({
      evidenceId: claimEvidenceLinks.evidenceId,
      claimId: claimEvidenceLinks.claimId,
      claimOrdinal: claims.ordinal,
      confidence: claimEvidenceLinks.confidence,
      createdAt: claimEvidenceLinks.createdAt,
      extractedText: evidence.extractedText,
      sourceDomain: sources.domain,
    })
    .from(claimEvidenceLinks)
    .innerJoin(claims, eq(claimEvidenceLinks.claimId, claims.id))
    .innerJoin(evidence, eq(claimEvidenceLinks.evidenceId, evidence.id))
    .innerJoin(sources, eq(evidence.sourceId, sources.id))
    .where(and(eq(claims.thesisId, thesisId), eq(claimEvidenceLinks.impact, "weakens")));
  return rows.map((r) => ({ ...r, confidence: Number(r.confidence) }));
}
```

- [ ] **Step 7: Verify types, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. `numeric` columns come back as **strings** from Drizzle — confirm the `Number(r.confidence)` conversion is present in `listWeakeningLinksForThesis`, since `selectBriefEvidence` multiplies it.

Note for 7b: `listLinksForClaimWithMode` deliberately returns the raw `ClaimEvidenceLink`, so its `confidence` is still a string. It cannot be passed straight to `claimHealthBreakdown` (which takes `number`) — the caller must map, exactly as `recomputeAndPersist` already does. Typecheck catches this, so it fails loudly rather than silently coercing.

- [ ] **Step 8: Summarize, get approval, then commit**

```bash
git add lib/challenge/select.ts lib/challenge/select.test.ts \
  lib/db/repositories/challenge-briefs.ts lib/db/repositories/claim-evidence-links.ts
git commit -m "feat: add brief evidence selection and challenge repositories"
```

---

## Task 7: Pipeline and Inngest wiring

**Files:**
- Create: `lib/ai/challenge-pipeline.ts`
- Modify: `lib/inngest/client.ts:3-10`
- Modify: `lib/inngest/functions/run-agent.ts`
- Modify: `lib/inngest/functions/evaluate-run.ts`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: `writeChallengeBrief`, `BriefEvidenceItem` (Task 5); `selectBriefEvidence`, `listWeakeningLinksForThesis`, `upsertBrief` (Task 6); `CHALLENGER_PROMPT_VERSION` (Task 5); `AgentRunMode` (Task 1).
- Produces: `writeBriefForRun(input): Promise<{ written: boolean; reason?: string }>`; `mode?: AgentRunMode` on `AgentRunRequested` and `AgentRunCompleted`.

- [ ] **Step 1: Write the pipeline**

Create `lib/ai/challenge-pipeline.ts`, mirroring `lib/ai/evaluate-pipeline.ts`:

```ts
import "server-only";
import type { AnthropicLike } from "@/lib/ai/client";
import { writeChallengeBrief, type BriefEvidenceItem } from "@/lib/ai/agents/challenger";
import { CHALLENGER_PROMPT_VERSION } from "@/lib/ai/prompts/challenger";
import { listWeakeningLinksForThesis } from "@/lib/db/repositories/claim-evidence-links";
import { upsertBrief } from "@/lib/db/repositories/challenge-briefs";
import { selectBriefEvidence } from "@/lib/challenge/select";

// Write the case against a thesis for one challenge run. Runs AFTER evaluation
// so it can only cite evidence the evaluator independently scored as weakening.
// Idempotent: the upsert targets agentRunId.
export async function writeBriefForRun(input: {
  thesisId: string;
  agentRunId: string;
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string };
  claims: { id: string; ordinal: number; statement: string }[];
  client: AnthropicLike;
  now?: Date;
}): Promise<{ written: boolean; reason?: string }> {
  const now = input.now ?? new Date();
  const links = await listWeakeningLinksForThesis(input.thesisId);
  if (links.length === 0) return { written: false, reason: "no_weakening_evidence" };

  const selected = selectBriefEvidence(links, now);
  const items: BriefEvidenceItem[] = selected.map((s) => ({
    evidenceId: s.evidenceId,
    claimId: s.claimId,
    claimOrdinal: s.claimOrdinal,
    extractedText: s.extractedText,
    sourceDomain: s.sourceDomain,
    confidence: s.confidence,
    ageDays: s.ageDays,
  }));

  const brief = await writeChallengeBrief(input.thesis, input.claims, items, { client: input.client });
  if (!brief) return { written: false, reason: "no_citable_brief" };

  await upsertBrief({
    agentRunId: input.agentRunId,
    thesisId: input.thesisId,
    headline: brief.headline,
    summary: brief.summary,
    points: brief.points,
    promptVersion: CHALLENGER_PROMPT_VERSION,
  });
  return { written: true };
}
```

- [ ] **Step 2: Add mode to the event payloads**

In `lib/inngest/client.ts`, extend both agent-run event types:

```ts
import type { AgentRunMode } from "@/schemas/agent";

export type AgentRunRequested = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string; mode?: AgentRunMode };
};

export type AgentRunCompleted = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string; mode?: AgentRunMode };
};
```

- [ ] **Step 3: Pass and forward mode in `run-agent.ts`**

In `lib/inngest/functions/run-agent.ts`, destructure `mode` from the event data and default it:

```ts
    const { agentRunId, thesisId, userId, scenario, batchId, mode } = event.data as AgentRunRequested["data"];
    const runMode = mode ?? "research";
```

Pass it as the sixth argument to `runResearcher` (after the scenario argument):

```ts
      scenario ?? "nvda-happy-path",
      runMode,
    );
```

And forward it on the completion event so `evaluate-run` can route on it:

```ts
      await step.sendEvent("emit-agent-run-completed", {
        name: "agent-run.completed",
        data: { agentRunId, thesisId, userId, scenario, batchId, mode: runMode },
      });
```

- [ ] **Step 4: Add the mode-guarded brief step in `evaluate-run.ts`**

In `lib/inngest/functions/evaluate-run.ts`, destructure `mode` alongside the rest, then add a step **after** the existing `recompute-health` step and **before** `settleBatch()`. The evaluator itself stays mode-blind — this is the function's routing concern only:

```ts
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { writeBriefForRun } from "@/lib/ai/challenge-pipeline";

    // Challenge runs get a brief once every piece of evidence has a verdict, so
    // the challenger can only argue from what the evaluator actually scored.
    if (mode === "challenge") {
      const briefClient: AnthropicLike = useFixtures
        ? {
            createMessage: async () =>
              new ChallengeBriefFixtureReader(scenario ?? "nvda-challenge").next() as Anthropic.Message,
          }
        : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
      await step.run("write-challenge-brief", () =>
        writeBriefForRun({
          thesisId,
          agentRunId,
          thesis: {
            title: thesis.title,
            ticker: thesis.ticker,
            positionDirection: thesis.positionDirection,
            timeHorizon: thesis.timeHorizon,
          },
          claims: thesis.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement })),
          client: briefClient,
        }),
      );
    }
```

`ChallengeBriefFixtureReader` lands in Task 8 — if executing tasks strictly in order, write this step now and expect the import to fail typecheck until Task 8 completes. Alternatively complete Task 8 first; the two tasks have no other dependency.

- [ ] **Step 5: Verify types, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass once Task 8 exists. If Task 8 is not yet done, typecheck fails only on the missing fixtures module.

- [ ] **Step 6: Update the architecture doc**

In `docs/ARCHITECTURE.md`:
- Add the **challenger** to the agent roster in "Three agents, separate concerns" (retitle to match the real count — the summarizer already made it four), describing it as a one-shot that argues from evaluator-scored evidence only.
- Document run modes in "Flow 1", including the placement of the brief step after evaluation and why.
- In the Extension seams table, update the "New agent roles (summarizer, devil's advocate…)" row to record that the devil's advocate shipped in Phase 7 as the challenger, via exactly the seam the table predicted.
- **Fix the system diagram**: the "Anthropic API — Embeddings" line is inaccurate (Anthropic exposes no embeddings endpoint) and describes a capability nothing in the codebase uses. Replace the roster with the four real agents.
- Add a short subsection on why challenge mode does not produce fabricated negativity — the prompt permits an empty result, the evaluator is mode-blind, and the brief may only cite scored evidence.

- [ ] **Step 7: Summarize, get approval, then commit**

```bash
git add lib/ai/challenge-pipeline.ts lib/inngest/client.ts \
  lib/inngest/functions/run-agent.ts lib/inngest/functions/evaluate-run.ts docs/ARCHITECTURE.md
git commit -m "feat: wire challenge runs and brief generation through Inngest"
```

---

## Task 8: Fixtures and the offline harness

**Files:**
- Create: `lib/ai/challenge-brief-fixtures.ts`
- Create: `__fixtures__/agent-runs/nvda-challenge/{messages,tools,evaluations,challenge-brief}.json`
- Create: `__fixtures__/agent-runs/nvda-challenge/README.md`
- Modify: `scripts/run-agent-fixture.ts`
- Test: `lib/ai/challenge-brief-fixtures.test.ts`

**Interfaces:**
- Consumes: `FIXTURE_ROOT` from `@/lib/ai/fixtures`.
- Produces: `ChallengeBriefFixtureReader` with `next(): unknown`.

- [ ] **Step 1: Write the failing reader test**

Create `lib/ai/challenge-brief-fixtures.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/challenge-brief-fixtures.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the reader**

Create `lib/ai/challenge-brief-fixtures.ts`, mirroring `EvaluationFixtureReader`:

```ts
import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline challenger replay. Cycled (not 1:1 with runs) so a scenario can be
// replayed repeatedly without exhausting. Each entry is a full Anthropic message
// containing a return_challenge_brief tool_use block.
export class ChallengeBriefFixtureReader {
  private items: unknown[];
  private idx = 0;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "challenge-brief.json");
    if (!existsSync(path)) throw new Error(`Challenge brief fixture not found: ${scenario} (${path})`);
    this.items = JSON.parse(readFileSync(path, "utf8")) as unknown[];
    if (this.items.length === 0) throw new Error(`Challenge brief fixture is empty: ${scenario}`);
  }
  next(): unknown {
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    return item;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ai/challenge-brief-fixtures.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Extend the offline harness for mode**

In `scripts/run-agent-fixture.ts`:
- Read a second CLI argument: `const mode = (process.argv[3] as AgentRunMode) ?? "research";`
- Pass `{ mode }` to `createAgentRun(thesis.id, "manual", { mode })`.
- Pass `mode` as the sixth argument to `runResearcher`.
- After the existing `recomputeAndPersist` call, when `mode === "challenge"`, call `writeBriefForRun` with a `ChallengeBriefFixtureReader`-backed client and assert a brief row exists via `getBriefForRun(run.id)`, logging its headline and point count.
- Update the file's header comment with the new invocation:
  `USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge`

- [ ] **Step 6: Author a provisional offline fixture**

Create `__fixtures__/agent-runs/nvda-challenge/` with the four files, copying the *structure* of `__fixtures__/agent-runs/nvda-happy-path/` exactly:
- `messages.json` — a challenge loop: one or two `web_search` / `web_fetch` tool-use messages, then a `return_result` message whose evidence items are plausible counter-evidence with correct `claim_indices`.
- `tools.json` — matching tool results, one per tool call, in order.
- `evaluations.json` — `return_evaluation` messages skewed to `weakens` with varied confidences (the reader cycles them).
- `challenge-brief.json` — a single-element array containing one message with a `return_challenge_brief` tool-use block that validates against `ChallengeBriefSchema`. It has no existing analogue, so its exact shape is:

```json
[
  {
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_challenge_1",
        "name": "return_challenge_brief",
        "input": {
          "headline": "Margin compression is showing up before any revenue slowdown",
          "summary": "Two independent reports put gross margin down sequentially while pricing pressure builds in the accelerator market. Neither contradicts the demand story directly, but both cut against the claim that scale keeps translating into margin.",
          "points": [
            {
              "claim_index": 0,
              "argument": "Gross margin fell sequentially despite record revenue, weakening the operating-leverage assumption.",
              "evidence_indices": [0]
            },
            {
              "claim_index": 1,
              "argument": "A competing toolkit shipped with published migration paths, which chips at the switching-cost argument.",
              "evidence_indices": [1]
            }
          ]
        }
      }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1800, "output_tokens": 260 }
  }
]
```

The `claim_index` and `evidence_indices` values must resolve against the claims and evidence the rest of the scenario produces — an index that doesn't resolve is silently dropped by the agent, which would make the harness look like it succeeded while storing less than it should.

Also create `__fixtures__/agent-runs/nvda-challenge/README.md` stating plainly that this scenario is **hand-authored for offline testing and has not yet been recorded from a live run** — and that it must be replaced by a real recording (Step 8) before it is used to seed anything user-facing.

- [ ] **Step 7: Run the offline harness end-to-end**

Requires a thesis in the dev DB. Run:

```bash
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
  --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge
```

Expected: a run row with `mode='challenge'`, iterations, evidence, `claim_evidence_links` with weakening verdicts, a health snapshot, and one `challenge_briefs` row whose headline and points print. Then run `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 8: Record the real scenario — Thiluxan runs this, with approval**

**This step spends real Anthropic tokens and must not be run by an agent unprompted.** Present the command and wait:

```bash
node --conditions=react-server --env-file=.env.local --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge
```

(no `USE_AI_FIXTURES`, so the loop calls the live API against a real NVDA thesis). Capture the real messages, tool results, evaluations, and brief into the four fixture files, replacing the provisional content, and delete the fixture README's provisional warning.

**This is a hard gate for 7b:** the `/demo` seed renders this content to recruiters, so the demo must never ship hand-authored evidence. If the recording is deferred, 7b's demo-seed task is blocked and must be flagged as such.

- [ ] **Step 9: Summarize, get approval, then commit**

```bash
git add lib/ai/challenge-brief-fixtures.ts lib/ai/challenge-brief-fixtures.test.ts \
  scripts/run-agent-fixture.ts __fixtures__/agent-runs/nvda-challenge/
git commit -m "feat: add challenge fixtures and offline harness support"
```

---

## Task 9: Phase documentation

**Files:**
- Create: `docs/phases/phase-7-challenge.md`

**Interfaces:**
- Consumes: nothing. Documentation only.

- [ ] **Step 1: Read an existing phase doc for the format**

Run: `cat docs/phases/phase-4-evaluator.md`
Match its structure, heading depth, and voice. Do not invent a new format.

- [ ] **Step 2: Write the phase doc**

Create `docs/phases/phase-7-challenge.md` covering: the two gaps it closes (unexplainable health scores; an agent that only ever confirms), the 7a/7b split, the run-mode concept and how it stays orthogonal to trigger, the challenger's role and why it runs after evaluation, the three-layer answer to prompt-induced negativity, the health-split semantics (and the constraint that sub-scores are not components of the total), what is explicitly out of scope, and the fixture-recording gate that blocks the 7b demo seed.

- [ ] **Step 3: Confirm 7a is complete**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. Then verify every 7a spec section has landed: §3 schema (Task 1), §4 challenge mode (Task 3), §5 challenger (Tasks 4–5), §6 Inngest flow (Task 7), §7 health split (Task 2), §9 fixtures (Task 8), §10 error handling (Tasks 5, 7), §11 tests (Tasks 1–6, 8), §12 docs for 7a (Tasks 1, 7, 9).

- [ ] **Step 4: Summarize, get approval, then commit**

```bash
git add docs/phases/phase-7-challenge.md
git commit -m "docs: add Phase 7 challenge phase doc"
```

---

## Notes for the executor

- **Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Tasks 7 and 8 are mutually referential (7's `evaluate-run` import comes from 8); doing 8 before 7 avoids a transient typecheck failure, and either order ends in the same place.
- **What "done" means here** (from `CLAUDE.md`): typecheck passes, lint clean, happy path verified, at least one failure case handled, new env vars documented (this phase adds none), migration generated and applied, a commit message explaining *why*, and Thiluxan's approval before the commit lands.
- **If a task appears to require touching the researcher's loop body, stop and raise it.** That constraint is the point of the phase's design.
- 7b (challenge trigger, brief rendering, the per-claim drill-down, `/demo` parity, design pass) gets its own plan after 7a merges.
