# Phase 5a — Scheduled Runs & Digest (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly Inngest cron analyzes every active thesis, a sentinel coordinates "all of a user's runs done," and a one-shot summarizer writes a per-thesis digest that Resend emails — only for theses that changed. No UI (that's 5b).

**Architecture:** A guarded cron emits `scheduled-runs.requested`; a scheduler creates a `digest_batches` sentinel row + one scheduled `agent_run` per active thesis (carrying `batchId`). The existing run→evaluate path is unchanged except it threads `batchId` and, when each thesis's pipeline finishes, atomically increments the sentinel; the last completion emits `digest.requested`. The digest generator selects changed theses (pure fn), calls the summarizer once (forced-tool, fixture-backed), renders a React Email, and sends via Resend — guarded to send at most once.

**Tech Stack:** Next.js 16, TypeScript (strict), Drizzle + Neon (neon-http, `db.batch()`), Inngest v4.5.1 (cron + event triggers), Anthropic SDK (`claude-sonnet-4-6`, forced `tool_choice`), Resend + React Email, Zod v4, Vitest (Node 22).

**Conventions (from CLAUDE.md):** no `any`; Zod is the source of truth (`z.infer`); DB types via `$inferSelect`; numeric columns come back as **strings** — convert with `Number()`/`String()`; all DB access through `lib/db/repositories/`; absolute `@/` imports; validate every AI output with Zod; **use Context7 for current docs before writing non-trivial library code** (Inngest cron, Resend, React Email); `npm run typecheck` + `npm run lint` before every commit; tests need Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

**Approval workflow:** explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, wait for approval.

**Refinements over the spec (intentional, noted where they occur):**
- `digest_batch_status` enum is `['pending','sending','sent','skipped']` (adds `sending`) so the digest generator can claim a batch with an atomic `pending→sending` transition (exactly-once email).
- "Changed thesis" = the batch run produced ≥1 evidence. This is equivalent to the spec's "new evidence OR health delta": health is only re-snapshotted by `evaluate-run`, which runs only when evidence > 0 — so a health delta cannot occur without new evidence. Health before/after is still computed for display.

---

## File Structure

**Create:** `schemas/digest-batch.ts`, `lib/db/evidence-enum-sync`-style drift test `lib/db/digest-batch-enum-sync.test.ts`, `lib/digest/week.ts` (+test), `lib/digest/select.ts` (+test), `lib/db/repositories/digest-batches.ts`, `lib/ai/schemas/digest.ts` (+test), `lib/ai/tools/return-digest.ts`, `lib/ai/prompts/summarizer.ts`, `lib/ai/agents/summarizer.ts` (+test), `lib/ai/digest-fixtures.ts`, `__fixtures__/agent-runs/nvda-happy-path/digest.json`, `lib/resend/client.ts`, `emails/WeeklyDigest.tsx`, `lib/inngest/functions/weekly-cron.ts`, `lib/inngest/functions/schedule-runs.ts`, `lib/inngest/functions/generate-digest.ts`.

**Modify:** `lib/db/schema.ts`, `lib/db/repositories/users.ts`, `lib/db/repositories/theses.ts`, `lib/db/repositories/agent-runs.ts`, `lib/inngest/client.ts`, `lib/inngest/functions/run-agent.ts`, `lib/inngest/functions/evaluate-run.ts`, `app/api/inngest/route.ts`, `app/(app)/theses/agent-actions.ts`, `lib/env.server.ts`, `.env.example`, `scripts/run-agent-fixture.ts`.

---

## Task 1: Schema — digest enum, batches table, columns

**Files:** Create `schemas/digest-batch.ts`, `lib/db/digest-batch-enum-sync.test.ts`; Modify `lib/db/schema.ts`.

- [ ] **Step 1: Client-safe tuple** — `schemas/digest-batch.ts`:
```ts
// Enum value tuple — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here. The drift-guard test asserts they match.
export const DIGEST_BATCH_STATUSES = ["pending", "sending", "sent", "skipped"] as const;
export type DigestBatchStatus = (typeof DIGEST_BATCH_STATUSES)[number];
```

- [ ] **Step 2: Schema changes** — in `lib/db/schema.ts`:
  - After the other `pgEnum`s (near `agentRunTrigger`, ~line 106) add:
    ```ts
    export const digestBatchStatus = pgEnum("digest_batch_status", ["pending", "sending", "sent", "skipped"]);
    ```
  - Add `digest_enabled` to the `users` table (after `email`):
    ```ts
    digestEnabled: boolean("digest_enabled").notNull().default(true),
    ```
    Add `boolean` to the `drizzle-orm/pg-core` import list at the top.
  - Add `digestBatchId` to `agentRuns` (after `trigger`):
    ```ts
    digestBatchId: uuid("digest_batch_id").references(() => digestBatches.id, { onDelete: "set null" }),
    ```
  - Add the table (after `agentRuns`, before the type exports):
    ```ts
    export const digestBatches = pgTable(
      "digest_batches",
      {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        weekOf: date("week_of").notNull(),
        expectedRuns: integer("expected_runs").notNull(),
        completedRuns: integer("completed_runs").notNull().default(0),
        status: digestBatchStatus("status").notNull().default("pending"),
        digestSentAt: timestamp("digest_sent_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
      },
      (t) => [uniqueIndex("digest_batches_user_week_idx").on(t.userId, t.weekOf)],
    );
    ```
    Add `date` and (if missing) `uniqueIndex`, `boolean` to the import list.
  - Add type exports near the others:
    ```ts
    export type DigestBatch = typeof digestBatches.$inferSelect;
    export type NewDigestBatch = typeof digestBatches.$inferInsert;
    ```
  > Note: `digestBatches` is referenced by `agentRuns.digestBatchId` but defined after it. Drizzle resolves the `() => digestBatches.id` thunk lazily, so forward reference is fine.

- [ ] **Step 3: Drift-guard test** — `lib/db/digest-batch-enum-sync.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DIGEST_BATCH_STATUSES } from "@/schemas/digest-batch";
import { digestBatchStatus } from "@/lib/db/schema";

describe("digest_batch_status enum sync", () => {
  it("pgEnum matches the client-safe tuple", () => {
    expect([...digestBatchStatus.enumValues]).toEqual([...DIGEST_BATCH_STATUSES]);
  });
});
```

- [ ] **Step 4: Verify** — `npm run typecheck && source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/db/digest-batch-enum-sync.test.ts`. Expected: clean; test PASS.

- [ ] **Step 5: Commit** (after approval)
```bash
git add schemas/digest-batch.ts lib/db/schema.ts lib/db/digest-batch-enum-sync.test.ts
git commit -m "feat: add digest_batches schema, digest_enabled, and run batch link"
```

---

## Task 2: Generate & apply the migration

**Files:** Create `drizzle/<generated>.sql`.

- [ ] **Step 1: Generate** — `npm run db:generate`. Read the SQL: expect the `digest_batch_status` type, `digest_batches` table + unique index, `users.digest_enabled` column, `agent_runs.digest_batch_id` column + FK. No unexpected drops.
- [ ] **Step 2: Apply** — `npm run db:migrate`. Expected: applies cleanly.
  > If the dev DB is unreachable, STOP and report BLOCKED — do not hand-edit the SQL.
- [ ] **Step 3: Commit** (after approval)
```bash
git add drizzle/
git commit -m "chore: generate migration for digest batches and digest_enabled"
```

---

## Task 3: `currentWeekOf` week helper (TDD)

**Files:** Create `lib/digest/week.ts`, `lib/digest/week.test.ts`.

- [ ] **Step 1: Failing test** — `lib/digest/week.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { currentWeekOf } from "./week";

describe("currentWeekOf", () => {
  it("returns the same date for a Sunday (UTC)", () => {
    expect(currentWeekOf(new Date("2026-06-14T09:00:00Z"))).toBe("2026-06-14"); // Sunday
  });
  it("returns the most recent Sunday for a midweek date", () => {
    expect(currentWeekOf(new Date("2026-06-17T23:30:00Z"))).toBe("2026-06-14"); // Wed -> prev Sun
  });
  it("handles the Saturday before a Sunday", () => {
    expect(currentWeekOf(new Date("2026-06-13T00:00:00Z"))).toBe("2026-06-07"); // Sat -> prev Sun
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/digest/week.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/digest/week.ts`:
```ts
// The "week of" key for a digest batch: the most recent Sunday on or before
// `now`, as a UTC YYYY-MM-DD string. Shared by the cron and the on-demand
// trigger so both target the same batch for a given week.
export function currentWeekOf(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay: Sunday = 0
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Verify pass** — same vitest command → PASS.
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/digest/week.ts lib/digest/week.test.ts
git commit -m "feat: add currentWeekOf digest-week helper"
```

---

## Task 4: `digest-batches` repository

**Files:** Create `lib/db/repositories/digest-batches.ts`.

- [ ] **Step 1: Implement** — `lib/db/repositories/digest-batches.ts`:
```ts
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { digestBatches, agentRuns, type DigestBatch, type AgentRun } from "@/lib/db/schema";
import type { DigestBatchStatus } from "@/schemas/digest-batch";

// Create or reset the batch for (userId, weekOf). Re-running a week resets the
// counters so a fresh batch of runs is tracked from zero.
export async function upsertBatch(input: {
  userId: string;
  weekOf: string;
  expectedRuns: number;
}): Promise<DigestBatch> {
  const [row] = await db
    .insert(digestBatches)
    .values({ userId: input.userId, weekOf: input.weekOf, expectedRuns: input.expectedRuns })
    .onConflictDoUpdate({
      target: [digestBatches.userId, digestBatches.weekOf],
      set: { expectedRuns: input.expectedRuns, completedRuns: 0, status: "pending", digestSentAt: null, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// Atomically count one finished run against the batch. Returns whether this
// increment completed the batch (so the caller fires the digest exactly once).
export async function recordBatchProgress(batchId: string): Promise<{ complete: boolean }> {
  const [row] = await db
    .update(digestBatches)
    .set({ completedRuns: sql`${digestBatches.completedRuns} + 1`, updatedAt: new Date() })
    .where(eq(digestBatches.id, batchId))
    .returning({ completed: digestBatches.completedRuns, expected: digestBatches.expectedRuns });
  return { complete: !!row && row.completed >= row.expected };
}

// Exactly-once claim: only the first caller flips pending -> sending. Returns
// the batch if claimed, else null (already handled).
export async function claimBatchForSend(batchId: string): Promise<DigestBatch | null> {
  const [row] = await db
    .update(digestBatches)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(digestBatches.id, batchId), eq(digestBatches.status, "pending")))
    .returning();
  return row ?? null;
}

export async function finishBatch(batchId: string, status: Extract<DigestBatchStatus, "sent" | "skipped">): Promise<void> {
  await db
    .update(digestBatches)
    .set({ status, digestSentAt: status === "sent" ? new Date() : null, updatedAt: new Date() })
    .where(eq(digestBatches.id, batchId));
}

export async function getBatch(batchId: string): Promise<DigestBatch | null> {
  const [row] = await db.select().from(digestBatches).where(eq(digestBatches.id, batchId)).limit(1);
  return row ?? null;
}

export async function listRunsForBatch(batchId: string): Promise<AgentRun[]> {
  return db.select().from(agentRuns).where(eq(agentRuns.digestBatchId, batchId));
}
```

- [ ] **Step 2: Verify** — `npm run typecheck` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/db/repositories/digest-batches.ts
git commit -m "feat: add digest-batches repository with atomic sentinel ops"
```

---

## Task 5: Repo extensions — users, theses, agent-runs

**Files:** Modify `lib/db/repositories/users.ts`, `lib/db/repositories/theses.ts`, `lib/db/repositories/agent-runs.ts`.

- [ ] **Step 1: users — digest toggle + active-thesis users** — append to `lib/db/repositories/users.ts`:
```ts
import { theses } from "@/lib/db/schema";

export async function setDigestEnabled(userId: string, enabled: boolean): Promise<void> {
  await db.update(users).set({ digestEnabled: enabled }).where(eq(users.id, userId));
}

// Distinct users that own at least one active thesis — the cron's scheduling set.
export async function listUserIdsWithActiveTheses(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: theses.userId })
    .from(theses)
    .where(eq(theses.status, "active"));
  return rows.map((r) => r.userId);
}
```
(Ensure `users` and `eq` are already imported — `users`/`eq` are; add `theses`.)

- [ ] **Step 2: theses — active theses for a user** — append to `lib/db/repositories/theses.ts`:
```ts
export async function listActiveThesesByUser(userId: string): Promise<Thesis[]> {
  return db
    .select()
    .from(theses)
    .where(and(eq(theses.userId, userId), eq(theses.status, "active")));
}
```
(`and`, `eq`, `theses`, `Thesis` are already imported in that file.)

- [ ] **Step 3: agent-runs — batch link on create + last-analyzed** — in `lib/db/repositories/agent-runs.ts` change `createAgentRun` and add a helper:
```ts
export async function createAgentRun(
  thesisId: string,
  trigger: AgentRunTrigger,
  digestBatchId?: string,
): Promise<AgentRun> {
  const [row] = await db
    .insert(agentRuns)
    .values({ thesisId, trigger, status: "queued", digestBatchId: digestBatchId ?? null })
    .returning();
  return row;
}

// Most recent terminal-run completion time per thesis, for "Last analyzed".
// Returns a Map of thesisId -> Date (only theses that have a completed run).
export async function lastAnalyzedByThesisIds(thesisIds: string[]): Promise<Map<string, Date>> {
  if (thesisIds.length === 0) return new Map();
  const rows = await db
    .select({ thesisId: agentRuns.thesisId, completedAt: sql<string>`max(${agentRuns.completedAt})` })
    .from(agentRuns)
    .where(inArray(agentRuns.thesisId, thesisIds))
    .groupBy(agentRuns.thesisId);
  const m = new Map<string, Date>();
  for (const r of rows) if (r.completedAt) m.set(r.thesisId, new Date(r.completedAt));
  return m;
}
```
Add `sql` and `inArray` to the `drizzle-orm` import in that file if missing.

- [ ] **Step 4: Verify** — `npm run typecheck` → clean.
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/db/repositories/users.ts lib/db/repositories/theses.ts lib/db/repositories/agent-runs.ts
git commit -m "feat: add repo helpers for digest prefs, active theses, batch-linked runs"
```

---

## Task 6: Digest schema + `return_digest` tool (TDD)

**Files:** Create `lib/ai/schemas/digest.ts`, `lib/ai/schemas/digest.test.ts`, `lib/ai/tools/return-digest.ts`.

- [ ] **Step 1: Failing test** — `lib/ai/schemas/digest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DigestSchema } from "./digest";

describe("DigestSchema", () => {
  it("accepts a valid digest", () => {
    const ok = { theses: [{ thesisId: "t1", blurb: "Revenue beat strengthens the growth claim." }] };
    expect(DigestSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects an empty blurb", () => {
    expect(DigestSchema.safeParse({ theses: [{ thesisId: "t1", blurb: "" }] }).success).toBe(false);
  });
  it("rejects a missing thesisId", () => {
    expect(DigestSchema.safeParse({ theses: [{ blurb: "x" }] }).success).toBe(false);
  });
  it("accepts an empty theses array", () => {
    expect(DigestSchema.safeParse({ theses: [] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/ai/schemas/digest.test.ts` → FAIL.

- [ ] **Step 3: Schema** — `lib/ai/schemas/digest.ts`:
```ts
import { z } from "zod";

export const DigestSchema = z.object({
  theses: z.array(
    z.object({
      thesisId: z.string().min(1),
      blurb: z.string().min(1),
    }),
  ),
});

export type DigestResult = z.infer<typeof DigestSchema>;
```

- [ ] **Step 4: Tool** — `lib/ai/tools/return-digest.ts`:
```ts
import "server-only";
import { DigestSchema, type DigestResult } from "@/lib/ai/schemas/digest";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the summarizer; execute() echoes for interface conformance.
export const returnDigestTool: Tool<DigestResult> = {
  name: "return_digest",
  description:
    "Return the weekly digest: for each thesis you were given, a 2-4 sentence plain-English summary of " +
    "what the new evidence means for that thesis and how its health moved. One entry per input thesis.",
  inputSchema: DigestSchema,
  async execute(input: DigestResult): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
```

- [ ] **Step 5: Verify** — `npx vitest run lib/ai/schemas/digest.test.ts && npm run typecheck` → PASS / clean.
- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/ai/schemas/digest.ts lib/ai/schemas/digest.test.ts lib/ai/tools/return-digest.ts
git commit -m "feat: add digest schema and return_digest tool"
```

---

## Task 7: Summarizer prompt

**Files:** Create `lib/ai/prompts/summarizer.ts`.

- [ ] **Step 1: Implement** — `lib/ai/prompts/summarizer.ts`:
```ts
// Bump when the prompt below changes.
export const SUMMARIZER_PROMPT_VERSION = "digest-v1";

export const systemPrompt = `You write a concise weekly digest for an investor tracking theses. For each thesis you are given, write 2-4 sentences: what the new evidence found this week means for the thesis, and how its health score moved (strengthened, weakened, or held). 

Rules:
- Be factual and specific to the evidence given. No hype, no filler, no generic market commentary.
- Reference the direction of the health change when it is meaningful.
- Do not invent evidence beyond what is provided.
- You MUST respond by calling the return_digest tool, with exactly one entry per thesis you were given (matching thesisId).`;

export type DigestThesisInput = {
  thesisId: string;
  title: string;
  ticker: string;
  positionDirection: "long" | "short";
  healthBefore: number | null;
  healthAfter: number | null;
  newEvidence: { sourceDomain: string; extractedText: string }[];
};

export function buildDigestTask(theses: DigestThesisInput[]): string {
  return theses
    .map((t) => {
      const before = t.healthBefore === null ? "n/a" : t.healthBefore.toFixed(2);
      const after = t.healthAfter === null ? "n/a" : t.healthAfter.toFixed(2);
      const ev = t.newEvidence.map((e) => `- (${e.sourceDomain}) ${e.extractedText}`).join("\n");
      return [
        `THESIS ${t.thesisId} — ${t.ticker} (${t.positionDirection}): ${t.title}`,
        `Health: ${before} -> ${after}`,
        `New evidence this week:`,
        ev || "- (none)",
      ].join("\n");
    })
    .join("\n\n");
}
```

- [ ] **Step 2: Verify** — `npm run typecheck` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/ai/prompts/summarizer.ts
git commit -m "feat: add summarizer prompt and digest task builder"
```

---

## Task 8: Summarizer agent (TDD)

**Files:** Create `lib/ai/agents/summarizer.ts`, `lib/ai/agents/summarizer.test.ts`.

- [ ] **Step 1: Failing test** — `lib/ai/agents/summarizer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { summarize } from "./summarizer";
import type { DigestThesisInput } from "@/lib/ai/prompts/summarizer";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({ content: [{ type: "tool_use", name: "return_digest", id: "d1", input }], usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Anthropic.Message,
  };
}

const theses: DigestThesisInput[] = [
  { thesisId: "t1", title: "Long NVDA", ticker: "NVDA", positionDirection: "long", healthBefore: 0.5, healthAfter: 0.2, newEvidence: [{ sourceDomain: "reuters.com", extractedText: "rev up 40%" }] },
];

describe("summarize", () => {
  it("returns the validated digest from the tool call", async () => {
    const client = clientReturning({ theses: [{ thesisId: "t1", blurb: "Growth held but momentum cooled." }] });
    const res = await summarize(theses, { client });
    expect(res.theses).toEqual([{ thesisId: "t1", blurb: "Growth held but momentum cooled." }]);
  });
  it("returns an empty digest when the tool output is malformed", async () => {
    const client = clientReturning({ nope: true });
    const res = await summarize(theses, { client });
    expect(res.theses).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/ai/agents/summarizer.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/ai/agents/summarizer.ts`:
```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { DigestSchema, type DigestResult } from "@/lib/ai/schemas/digest";
import { returnDigestTool } from "@/lib/ai/tools/return-digest";
import { systemPrompt, buildDigestTask, type DigestThesisInput } from "@/lib/ai/prompts/summarizer";

const tools = [
  {
    name: returnDigestTool.name,
    description: returnDigestTool.description,
    input_schema: z.toJSONSchema(returnDigestTool.inputSchema) as unknown,
  },
];

export async function summarize(
  theses: DigestThesisInput[],
  deps: { client: AnthropicLike },
): Promise<DigestResult> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildDigestTask(theses) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_digest" },
    thinking: false,
    maxTokens: 2048,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_digest",
  );
  const parsed = DigestSchema.safeParse(toolUse?.input);
  return parsed.success ? parsed.data : { theses: [] };
}
```
(`EVALUATOR_MODEL` is `claude-sonnet-4-6`, already exported from `lib/ai/client.ts`; the summarizer reuses it as the writing model.)

- [ ] **Step 4: Verify pass** — `npx vitest run lib/ai/agents/summarizer.test.ts && npm run typecheck` → PASS / clean.
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/ai/agents/summarizer.ts lib/ai/agents/summarizer.test.ts
git commit -m "feat: add one-shot summarizer agent"
```

---

## Task 9: Summarizer fixtures

**Files:** Create `lib/ai/digest-fixtures.ts`, `__fixtures__/agent-runs/nvda-happy-path/digest.json`.

- [ ] **Step 1: Reader** — `lib/ai/digest-fixtures.ts`:
```ts
import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline summarizer replay: one recorded return_digest message per scenario.
export class DigestFixtureReader {
  private item: unknown;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "digest.json");
    if (!existsSync(path)) throw new Error(`Digest fixture not found: ${scenario} (${path})`);
    this.item = JSON.parse(readFileSync(path, "utf8"));
  }
  next(): unknown {
    return this.item;
  }
}
```

- [ ] **Step 2: Fixture data** — `__fixtures__/agent-runs/nvda-happy-path/digest.json`:
```json
{ "content": [{ "type": "tool_use", "id": "d1", "name": "return_digest", "input": { "theses": [{ "thesisId": "REPLACED_AT_RUNTIME", "blurb": "New reporting shows data-center revenue up 40% YoY, directly supporting the growth claim; overall health held positive despite a cautious note on competition." }] } }], "usage": { "input_tokens": 300, "output_tokens": 60 } }
```
> The `thesisId` here is a placeholder. Because fixtures can't know the dev thesis id, the offline harness (Task 18) and the digest function map the summarizer's blurbs back to theses **by array position** when `USE_AI_FIXTURES` is on (the summarizer is given the changed theses in order). The production path matches by `thesisId`. Document this in the digest function (Task 16).

- [ ] **Step 3: Verify** — `npm run typecheck` → clean (no usage yet).
- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/ai/digest-fixtures.ts __fixtures__/agent-runs/nvda-happy-path/digest.json
git commit -m "feat: add offline summarizer fixture reader and data"
```

---

## Task 10: `selectChangedTheses` (TDD)

**Files:** Create `lib/digest/select.ts`, `lib/digest/select.test.ts`.

- [ ] **Step 1: Failing test** — `lib/digest/select.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectChangedTheses } from "./select";

const base = {
  theses: [
    { id: "t1", title: "Long NVDA", ticker: "NVDA", positionDirection: "long" as const },
    { id: "t2", title: "Long XAU", ticker: "XAU", positionDirection: "long" as const },
  ],
  evidenceByThesis: new Map([["t1", [{ sourceDomain: "reuters.com", extractedText: "rev up 40%" }]]]), // t2 none
  snapshotsByThesis: new Map([["t1", [{ overallScore: 0.2 }, { overallScore: 0.5 }]]]), // newest-first
};

describe("selectChangedTheses", () => {
  it("includes only theses whose batch run produced evidence", () => {
    const out = selectChangedTheses(base);
    expect(out.map((t) => t.thesisId)).toEqual(["t1"]);
  });
  it("derives healthAfter/healthBefore from the two newest snapshots", () => {
    const [t1] = selectChangedTheses(base);
    expect(t1.healthAfter).toBe(0.2);
    expect(t1.healthBefore).toBe(0.5);
    expect(t1.newEvidence).toHaveLength(1);
  });
  it("uses null health when there are no prior snapshots", () => {
    const out = selectChangedTheses({
      ...base,
      snapshotsByThesis: new Map([["t1", [{ overallScore: 0.2 }]]]),
    });
    expect(out[0].healthAfter).toBe(0.2);
    expect(out[0].healthBefore).toBeNull();
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/digest/select.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/digest/select.ts`:
```ts
import type { DigestThesisInput } from "@/lib/ai/prompts/summarizer";

type ThesisLite = { id: string; title: string; ticker: string; positionDirection: "long" | "short" };

// A thesis is "changed" iff its batch run produced new evidence. (Health is only
// re-snapshotted by evaluate-run, which runs only when evidence > 0 — so a health
// delta cannot occur without new evidence.) Health before/after come from the two
// newest snapshots (newest-first input).
export function selectChangedTheses(input: {
  theses: ThesisLite[];
  evidenceByThesis: Map<string, { sourceDomain: string; extractedText: string }[]>;
  snapshotsByThesis: Map<string, { overallScore: number }[]>;
}): DigestThesisInput[] {
  const out: DigestThesisInput[] = [];
  for (const t of input.theses) {
    const evidence = input.evidenceByThesis.get(t.id) ?? [];
    if (evidence.length === 0) continue;
    const snaps = input.snapshotsByThesis.get(t.id) ?? [];
    out.push({
      thesisId: t.id,
      title: t.title,
      ticker: t.ticker,
      positionDirection: t.positionDirection,
      healthAfter: snaps[0] ? snaps[0].overallScore : null,
      healthBefore: snaps[1] ? snaps[1].overallScore : null,
      newEvidence: evidence,
    });
  }
  return out;
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run lib/digest/select.test.ts` → PASS.
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/digest/select.ts lib/digest/select.test.ts
git commit -m "feat: add pure changed-thesis digest selection"
```

---

## Task 11: Resend client + env

**Files:** Create `lib/resend/client.ts`; Modify `lib/env.server.ts`, `.env.example`.

> **Before implementing:** use Context7 (`resend` and `react-email`) to confirm the current `resend.emails.send(...)` shape and that passing a React element via `react:` is supported in the installed version. Install deps: `npm install resend @react-email/components`. Adjust the literal below if the API differs.

- [ ] **Step 1: Install** — `npm install resend @react-email/components`.

- [ ] **Step 2: Env** — in `lib/env.server.ts` add to `serverEnvSchema` and the parse object:
```ts
  // Email (digest). Optional so non-digest requests boot without them; the
  // digest function guards its own usage.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  SCHEDULED_RUNS_ENABLED: z.boolean(),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
```
and in the parse call:
```ts
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  SCHEDULED_RUNS_ENABLED: process.env.SCHEDULED_RUNS_ENABLED === "1",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
```
Append to `.env.example`:
```
RESEND_API_KEY=
RESEND_FROM_EMAIL="Thesis Tracker <digests@example.com>"
SCHEDULED_RUNS_ENABLED=0
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Client** — `lib/resend/client.ts`:
```ts
import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";
import { serverEnv } from "@/lib/env.server";

// Thin wrapper. Throws if email isn't configured (the digest function only calls
// this on the real path; dev/fixtures never send).
export async function sendDigestEmail(input: { to: string; subject: string; react: ReactElement }): Promise<void> {
  if (!serverEnv.RESEND_API_KEY || !serverEnv.RESEND_FROM_EMAIL) {
    throw new Error("Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)");
  }
  const resend = new Resend(serverEnv.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    react: input.react,
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}
```

- [ ] **Step 4: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 5: Commit** (after approval)
```bash
git add package.json package-lock.json lib/resend/client.ts lib/env.server.ts .env.example
git commit -m "feat: add Resend client and digest/scheduling env vars"
```

---

## Task 12: React Email template

**Files:** Create `emails/WeeklyDigest.tsx`.

> **Before implementing:** use Context7 (`react-email`) to confirm the current component imports from `@react-email/components` and the `render`/preview conventions.

- [ ] **Step 1: Implement** — `emails/WeeklyDigest.tsx`:
```tsx
import { Html, Head, Body, Container, Section, Heading, Text, Link, Hr } from "@react-email/components";

export type DigestEmailThesis = {
  thesisId: string;
  ticker: string;
  title: string;
  healthBefore: number | null;
  healthAfter: number | null;
  blurb: string;
};

function delta(before: number | null, after: number | null): string {
  const fmt = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  if (after === null) return "";
  if (before === null) return `health ${fmt(after)}`;
  return `health ${fmt(before)} → ${fmt(after)}`;
}

export function WeeklyDigest({ theses, appUrl }: { theses: DigestEmailThesis[]; appUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#18181b" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 18, fontWeight: 600 }}>Your weekly thesis digest</Heading>
          <Text style={{ color: "#71717a", fontSize: 13 }}>
            What changed across the theses analyzed this week.
          </Text>
          {theses.map((t) => (
            <Section key={t.thesisId} style={{ margin: "16px 0" }}>
              <Text style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                {t.ticker} — {t.title}
              </Text>
              <Text style={{ fontSize: 12, color: "#71717a", margin: "2px 0" }}>{delta(t.healthBefore, t.healthAfter)}</Text>
              <Text style={{ fontSize: 13, lineHeight: "1.5", margin: "6px 0" }}>{t.blurb}</Text>
              <Link href={`${appUrl}/theses/${t.thesisId}`} style={{ fontSize: 12, color: "#1E3A5F" }}>
                View thesis →
              </Link>
            </Section>
          ))}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 11, color: "#a1a1aa" }}>
            You can turn off these emails anytime in your notification settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WeeklyDigest;
```

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add emails/WeeklyDigest.tsx
git commit -m "feat: add weekly digest React Email template"
```

---

## Task 13: Inngest event types

**Files:** Modify `lib/inngest/client.ts`.

- [ ] **Step 1: Add events + batchId** — in `lib/inngest/client.ts`:
```ts
export type AgentRunRequested = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string };
};

export type AgentRunCompleted = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string };
};

export type ScheduledRunsRequested = {
  data: { weekOf: string; userId?: string };
};

export type DigestRequested = {
  data: { userId: string; batchId: string; scenario?: string };
};
```
(Extend the two existing types with `batchId?: string`; add the two new ones.)

- [ ] **Step 2: Verify** — `npm run typecheck` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/inngest/client.ts
git commit -m "feat: add scheduled-runs and digest event types"
```

---

## Task 14: Cron + scheduler functions

**Files:** Create `lib/inngest/functions/weekly-cron.ts`, `lib/inngest/functions/schedule-runs.ts`.

> **Before implementing:** use Context7 (`inngest`) to confirm the v4.5.1 cron-trigger shape (`triggers: [{ cron: "0 9 * * 0" }]`) and that `step.sendEvent(id, payload | payload[])` accepts an array of events. Adjust if the installed API differs; keep behavior identical.

- [ ] **Step 1: Cron** — `lib/inngest/functions/weekly-cron.ts`:
```ts
import "server-only";
import { inngest } from "@/lib/inngest/client";
import { currentWeekOf } from "@/lib/digest/week";
import { serverEnv } from "@/lib/env.server";

// Sunday 09:00 UTC. Guarded: only fires real scheduling when explicitly enabled,
// so prod doesn't spend API budget unattended. The on-demand action ignores this flag.
export const weeklyCron = inngest.createFunction(
  { id: "weekly-cron", triggers: [{ cron: "0 9 * * 0" }] },
  async ({ step }) => {
    if (!serverEnv.SCHEDULED_RUNS_ENABLED) return { status: "disabled" as const };
    await step.sendEvent("emit-scheduled-runs", {
      name: "scheduled-runs.requested",
      data: { weekOf: currentWeekOf() },
    });
    return { status: "scheduled" as const };
  },
);
```

- [ ] **Step 2: Scheduler** — `lib/inngest/functions/schedule-runs.ts`:
```ts
import "server-only";
import { inngest, type ScheduledRunsRequested } from "@/lib/inngest/client";
import { listUserIdsWithActiveTheses } from "@/lib/db/repositories/users";
import { listActiveThesesByUser } from "@/lib/db/repositories/theses";
import { createAgentRun } from "@/lib/db/repositories/agent-runs";
import { upsertBatch } from "@/lib/db/repositories/digest-batches";
import { serverEnv } from "@/lib/env.server";

// Schedule one user's active theses: create the sentinel batch, then a scheduled
// run per thesis carrying the batchId. Shared by the cron (all users) and the
// on-demand trigger (one user).
async function scheduleUserBatch(userId: string, weekOf: string): Promise<number> {
  const theses = await listActiveThesesByUser(userId);
  if (theses.length === 0) return 0;
  const batch = await upsertBatch({ userId, weekOf, expectedRuns: theses.length });
  // Fixtures keep scheduled dev runs deterministic & free; real path omits scenario.
  const scenario = serverEnv.USE_AI_FIXTURES ? "nvda-happy-path" : undefined;
  for (const t of theses) {
    const run = await createAgentRun(t.id, "scheduled", batch.id);
    await inngest.send({
      name: "agent.run-requested",
      data: { agentRunId: run.id, thesisId: t.id, userId, scenario, batchId: batch.id },
    });
  }
  return theses.length;
}

export const scheduleRuns = inngest.createFunction(
  { id: "schedule-runs", triggers: [{ event: "scheduled-runs.requested" }] },
  async ({ event }) => {
    const { weekOf, userId } = event.data as ScheduledRunsRequested["data"];
    const userIds = userId ? [userId] : await listUserIdsWithActiveTheses();
    let scheduled = 0;
    for (const uid of userIds) scheduled += await scheduleUserBatch(uid, weekOf);
    return { status: "scheduled" as const, users: userIds.length, runs: scheduled };
  },
);
```

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/inngest/functions/weekly-cron.ts lib/inngest/functions/schedule-runs.ts
git commit -m "feat: add weekly cron and scheduler with sentinel batches"
```

---

## Task 15: Thread batchId + sentinel into run-agent & evaluate-run

**Files:** Modify `lib/inngest/functions/run-agent.ts`, `lib/inngest/functions/evaluate-run.ts`.

- [ ] **Step 1: run-agent — pull batchId, thread it, increment on zero-evidence** — in `lib/inngest/functions/run-agent.ts`:
  - Import: `import { recordBatchProgress } from "@/lib/db/repositories/digest-batches";`
  - Change the destructure (line ~19): `const { agentRunId, thesisId, userId, scenario, batchId } = event.data as AgentRunRequested["data"];`
  - Replace the existing post-`finishRun` emit block:
    ```ts
    // Kick off evaluation only when the run actually produced evidence.
    if (result.status !== "failed" && result.evidenceCount > 0) {
      await step.sendEvent("emit-agent-run-completed", {
        name: "agent-run.completed",
        data: { agentRunId, thesisId, userId, scenario },
      });
    }
    ```
    with:
    ```ts
    if (result.status !== "failed" && result.evidenceCount > 0) {
      // Evidence path: evaluation runs next and will record batch progress when done.
      await step.sendEvent("emit-agent-run-completed", {
        name: "agent-run.completed",
        data: { agentRunId, thesisId, userId, scenario, batchId },
      });
    } else if (batchId) {
      // No-evidence (or failed) scheduled run: no evaluation will fire, so count it
      // against the batch here and fire the digest if this was the last one.
      const { complete } = await step.run("record-batch-progress", () => recordBatchProgress(batchId));
      if (complete) {
        await step.sendEvent("emit-digest-requested", {
          name: "digest.requested",
          data: { userId, batchId, scenario },
        });
      }
    }
    ```

- [ ] **Step 2: evaluate-run — accept batchId, increment on completion** — in `lib/inngest/functions/evaluate-run.ts`:
  - Import: `import { recordBatchProgress } from "@/lib/db/repositories/digest-batches";`
  - Change the destructure: `const { agentRunId, thesisId, userId, scenario, batchId } = event.data as AgentRunCompleted["data"];`
  - The function returns early in two no-op cases (`skipped`, `no-evidence`). A scheduled run that reaches here always had evidence (run-agent only emits `agent-run.completed` with evidence), but the thesis/evidence could still be absent on a redelivery. Ensure the batch is counted on **every** terminal path when `batchId` is present. Replace the early returns and the final return so each first records progress. Concretely, add a helper at the end and route all exits through it:
    ```ts
    async function settleBatch(): Promise<void> {
      if (!batchId) return;
      const { complete } = await step.run("record-batch-progress", () => recordBatchProgress(batchId));
      if (complete) {
        await step.sendEvent("emit-digest-requested", {
          name: "digest.requested",
          data: { userId, batchId, scenario },
        });
      }
    }
    ```
    - Before `return { status: "skipped" as const };` → `await settleBatch();`
    - Before `return { status: "no-evidence" as const };` → `await settleBatch();`
    - Before the final `return { status: "evaluated" as const, ... };` → `await settleBatch();`
  > Idempotency: `record-batch-progress` is its own `step.run`, so an Inngest retry of `evaluate-run` won't double-count (completed steps are memoized).

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/inngest/functions/run-agent.ts lib/inngest/functions/evaluate-run.ts
git commit -m "feat: record batch progress and fire digest when a user's runs finish"
```

---

## Task 16: Digest generator function

**Files:** Create `lib/inngest/functions/generate-digest.ts`.

- [ ] **Step 1: Implement** — `lib/inngest/functions/generate-digest.ts`:
```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { createElement } from "react";
import { inngest, type DigestRequested } from "@/lib/inngest/client";
import { getBatch, claimBatchForSend, finishBatch, listRunsForBatch } from "@/lib/db/repositories/digest-batches";
import { getUserById } from "@/lib/db/repositories/users";
import { getThesesByIds } from "@/lib/db/repositories/theses";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { selectChangedTheses } from "@/lib/digest/select";
import { summarize } from "@/lib/ai/agents/summarizer";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { WeeklyDigest, type DigestEmailThesis } from "@/emails/WeeklyDigest";
import { sendDigestEmail } from "@/lib/resend/client";
import { serverEnv } from "@/lib/env.server";

export const generateDigest = inngest.createFunction(
  { id: "generate-digest", retries: 2, triggers: [{ event: "digest.requested" }] },
  async ({ event, step }) => {
    const { batchId, userId, scenario } = event.data as DigestRequested["data"];

    // Exactly-once claim: only the first delivery flips pending -> sending.
    const claimed = await step.run("claim-batch", () => claimBatchForSend(batchId));
    if (!claimed) return { status: "already-handled" as const };

    const user = await step.run("load-user", () => getUserById(userId));
    if (!user) { await finishBatch(batchId, "skipped"); return { status: "no-user" as const }; }
    if (!user.digestEnabled) { await finishBatch(batchId, "skipped"); return { status: "disabled" as const }; }

    // Gather the batch's runs and, per thesis, its evidence + snapshots.
    const runs = await step.run("load-runs", () => listRunsForBatch(batchId));
    const thesisIds = [...new Set(runs.map((r) => r.thesisId))];
    const theses = await step.run("load-theses", () => getThesesByIds(thesisIds));

    const evidenceByThesis = new Map<string, { sourceDomain: string; extractedText: string }[]>();
    const snapshotsByThesis = new Map<string, { overallScore: number }[]>();
    for (const run of runs) {
      const ev = await step.run(`load-evidence-${run.id}`, () => listEvidenceForRun(run.id));
      if (ev.length) {
        const srcRows = await getSourcesByIds([...new Set(ev.map((e) => e.sourceId))]);
        const domainById = new Map(srcRows.map((s) => [s.id, s.domain]));
        evidenceByThesis.set(
          run.thesisId,
          ev.map((e) => ({ sourceDomain: domainById.get(e.sourceId) ?? "source", extractedText: e.extractedText })),
        );
      }
    }
    for (const t of theses) {
      const snaps = await step.run(`load-snaps-${t.id}`, () => listSnapshotsForThesis(t.id));
      snapshotsByThesis.set(t.id, snaps.map((s) => ({ overallScore: Number(s.overallScore) })));
    }

    const changed = selectChangedTheses({
      theses: theses.map((t) => ({ id: t.id, title: t.title, ticker: t.ticker, positionDirection: t.positionDirection })),
      evidenceByThesis,
      snapshotsByThesis,
    });
    if (changed.length === 0) { await finishBatch(batchId, "skipped"); return { status: "nothing-changed" as const }; }

    // Summarize (fixture-backed offline).
    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const client: AnthropicLike = useFixtures
      ? { createMessage: async () => new DigestFixtureReader(scenario ?? "nvda-happy-path").next() as Anthropic.Message }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
    const digest = await step.run("summarize", () => summarize(changed, { client }));

    // Map blurbs to theses: by thesisId on the real path; by position with fixtures
    // (the recorded fixture can't know the dev thesis id).
    const blurbByThesisId = new Map(digest.theses.map((d) => [d.thesisId, d.blurb]));
    const emailTheses: DigestEmailThesis[] = changed.map((c, i) => ({
      thesisId: c.thesisId,
      ticker: c.ticker,
      title: c.title,
      healthBefore: c.healthBefore,
      healthAfter: c.healthAfter,
      blurb: blurbByThesisId.get(c.thesisId) ?? digest.theses[i]?.blurb ?? "",
    }));

    await step.run("send-email", () =>
      sendDigestEmail({
        to: user.email,
        subject: "Your weekly thesis digest",
        react: createElement(WeeklyDigest, { theses: emailTheses, appUrl: serverEnv.NEXT_PUBLIC_APP_URL }),
      }),
    );
    await finishBatch(batchId, "sent");
    return { status: "sent" as const, theses: emailTheses.length };
  },
);
```

- [ ] **Step 2: Add the repo helpers it needs** — if absent, add to `lib/db/repositories/users.ts`:
```ts
export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}
```
and to `lib/db/repositories/theses.ts`:
```ts
export async function getThesesByIds(ids: string[]): Promise<Thesis[]> {
  if (ids.length === 0) return [];
  return db.select().from(theses).where(inArray(theses.id, ids));
}
```
(Add `inArray` to the `drizzle-orm` import in `theses.ts` if missing.)

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/inngest/functions/generate-digest.ts lib/db/repositories/users.ts lib/db/repositories/theses.ts
git commit -m "feat: add digest generator (claim, select, summarize, email)"
```

---

## Task 17: Register functions + on-demand trigger

**Files:** Modify `app/api/inngest/route.ts`, `app/(app)/theses/agent-actions.ts`.

- [ ] **Step 1: Register** — in `app/api/inngest/route.ts` import the new functions and add them to the `serve({ functions: [...] })` array: `runAgent, evaluateRun, weeklyCron, scheduleRuns, generateDigest`.

- [ ] **Step 2: On-demand action** — append to `app/(app)/theses/agent-actions.ts`:
```ts
import { currentWeekOf } from "@/lib/digest/week";
import type { ActionResult } from "@/app/(app)/theses/actions";

// Demo/runtime affordance: analyze ALL of the current user's active theses now
// and email the digest when they finish — same path the Sunday cron uses, scoped
// to this user. Independent of SCHEDULED_RUNS_ENABLED.
export async function triggerWeeklyDigestNow(): Promise<ActionResult> {
  const userId = await requireUserId();
  await inngest.send({
    name: "scheduled-runs.requested",
    data: { weekOf: currentWeekOf(), userId },
  });
  return { ok: true };
}
```
(`requireUserId` and `inngest` are already imported in that file. If `ActionResult` is already imported, don't duplicate.)

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add app/\(app\)/theses/agent-actions.ts app/api/inngest/route.ts
git commit -m "feat: register digest functions and add on-demand trigger action"
```

---

## Task 18: Extend the offline harness end-to-end

**Files:** Modify `scripts/run-agent-fixture.ts`.

Drive the digest path offline: after the existing run+evaluation, build the changed-thesis input from the harness's own thesis/evidence/snapshots, run the fixtured summarizer, render the email to a string (don't send), and print a summary.

- [ ] **Step 1: Imports** — add near the top:
```ts
import { selectChangedTheses } from "@/lib/digest/select";
import { summarize } from "@/lib/ai/agents/summarizer";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { hostnameOf } from "@/lib/ai/url";
```
(`listSnapshotsForThesis` may already be imported from Phase 4b — don't duplicate.)

- [ ] **Step 2: Drive the digest** — after the Phase 4b snapshot block (just before the final `console.log`), add:
```ts
  // --- Digest pipeline (offline, fixture-backed) ---
  const digestSnaps = await listSnapshotsForThesis(thesis.id);
  const changed = selectChangedTheses({
    theses: [{ id: thesis.id, title: thesis.title, ticker: thesis.ticker, positionDirection: thesis.positionDirection }],
    evidenceByThesis: new Map([[thesis.id, ev.map((e) => ({ sourceDomain: hostnameOf((sourcesById.get(e.sourceId)?.url) ?? "https://source"), extractedText: e.extractedText }))]]),
    snapshotsByThesis: new Map([[thesis.id, digestSnaps.map((s) => ({ overallScore: Number(s.overallScore) }))]]),
  });
  const digestClient: AnthropicLike = { createMessage: async () => new DigestFixtureReader(scenario).next() as Anthropic.Message };
  const digest = changed.length ? await summarize(changed, { client: digestClient }) : { theses: [] };
```
> NOTE: if the harness doesn't already build a `sourcesById` map, map evidence domains via `findOrCreateSource`/the source rows it persisted, or fall back to a literal `"source"` domain — the digest content isn't asserted, only that the pipeline runs. Keep it minimal.

- [ ] **Step 3: Report** — extend the final `console.log` object with:
```ts
      digestThesesChanged: changed.length, digestBlurbs: digest.theses.length,
```

- [ ] **Step 4: Verify typecheck** — `npm run typecheck` → clean.

- [ ] **Step 5: Run end-to-end** — requires Node 22 + dev DB + `.env.local`:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local --import tsx scripts/run-agent-fixture.ts nvda-happy-path
```
Expected JSON includes `digestThesesChanged: 1` and `digestBlurbs: 1` (the fixture returns one blurb), alongside the Phase 4 fields.
> If the dev DB is unreachable, report typecheck result and mark the live run BLOCKED.

- [ ] **Step 6: Full suite** — `npx vitest run` → all pass.
- [ ] **Step 7: Commit** (after approval)
```bash
git add scripts/run-agent-fixture.ts
git commit -m "test: drive the digest pipeline in the offline fixtured harness"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- `users.digest_enabled`, `digest_batches` (+ enum/tuple/drift), `agent_runs.digest_batch_id` → Tasks 1–2. ✓
- Cron (Sun 09:00 UTC, env-gated) + scheduler (all users or one) → Task 14. ✓
- Sentinel coordination, zero-evidence + completion increment, exactly-once digest → Tasks 4, 15, 16 (claim guard). ✓
- Summarizer agent (one-shot, forced tool, Sonnet, fixtures, prompt version) → Tasks 6–9. ✓
- Changed-thesis selection (pure) → Task 10. ✓
- Resend client + React Email + env → Tasks 11–12. ✓
- Digest generator (prefs gate, quiet-week skip, summarize, send) → Task 16. ✓
- On-demand per-user trigger → Task 17. ✓
- Offline end-to-end → Task 18. ✓
- 5b UI (last-analyzed, settings page, run-now button) correctly **excluded** (separate plan).

**Placeholder scan:** No TBD/TODO. Three external-API tasks (Resend, React Email, Inngest cron) carry explicit Context7-verify instructions rather than unverified guesses, matching the project convention. The fixture `thesisId` placeholder is explicitly handled by the position-fallback mapping in Task 16 and documented.

**Type consistency:** `DigestThesisInput` (Task 7) is produced by `selectChangedTheses` (Task 10) and consumed by `summarize` (Task 8) and the generator (Task 16). `DigestResult`/`DigestSchema` (Task 6) flow through Tasks 8/16. `recordBatchProgress`/`claimBatchForSend`/`finishBatch`/`upsertBatch` (Task 4) are used consistently in Tasks 14–16. `currentWeekOf` (Task 3) used in Tasks 14, 17. `batchId` event field (Task 13) threaded through Tasks 14–16. Numeric↔string conversions (`overallScore`) handled at every boundary.
```
