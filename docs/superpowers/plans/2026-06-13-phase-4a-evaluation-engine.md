# Phase 4a — Evaluation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a researcher run completes, evaluate every (claim, evidence) pair with a one-shot Sonnet 4.6 evaluator, store the verdicts, and compute confidence-weighted, time-decayed health per claim plus a per-run thesis health snapshot — all backend, no UI.

**Architecture:** A new Inngest function `evaluate-run` triggers on an `agent-run.completed` event emitted by `run-agent`. It evaluates the claim×evidence matrix (skipping cached pairs), recomputes each claim's health from its full link history via pure functions in `lib/health/`, and writes claim scores + one `thesis_health_snapshots` row in a single `db.batch()`. The evaluator is a one-shot forced-tool-use call, fixture-backed offline like the researcher.

**Tech Stack:** Next.js 16, TypeScript (strict), Drizzle + Neon (neon-http, `db.batch()` — no interactive tx), Anthropic SDK (`claude-sonnet-4-6`, forced `tool_choice`), Inngest v4.5.1, Zod v4, Vitest (Node 22).

**Conventions to follow (from CLAUDE.md):** no `any`; Zod is the source of truth (`z.infer`); DB types via `$inferSelect`; all DB access through `lib/db/repositories/`; absolute `@/` imports; numeric columns come back from Drizzle as **strings** — convert at boundaries with `Number()` / `String()`; validate every AI output with Zod; run `npm run typecheck` + `npm run lint` before every commit; tests need Node 22 (`nvm use 22`).

**Approval workflow:** This project requires explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, and wait for approval before committing.

---

## File Structure

**Create:**
- `schemas/evidence.ts` — `EVIDENCE_IMPACTS` client-safe tuple + `EvidenceImpact` type.
- `lib/db/evidence-enum-sync.test.ts` — drift guard (pgEnum ↔ tuple).
- `lib/health/score.ts` — pure health math.
- `lib/health/score.test.ts` — health math tests.
- `lib/ai/schemas/evaluation.ts` — `EvaluationSchema`, `EvaluationResult`.
- `lib/ai/schemas/evaluation.test.ts` — schema validation tests.
- `lib/ai/tools/return-evaluation.ts` — the `return_evaluation` tool definition.
- `lib/ai/prompts/evaluator.ts` — `systemPrompt`, `buildEvaluationTask`, `EVALUATOR_PROMPT_VERSION`.
- `lib/ai/agents/evaluator.ts` — `evaluate(claim, evidence, deps)` one-shot.
- `lib/ai/agents/evaluator.test.ts` — evaluator unit test (injected client).
- `lib/ai/evaluate-pipeline.ts` — `evaluateMatrix`, `recomputeAndPersist` (server-only orchestration; shared by Inngest fn + harness).
- `lib/db/repositories/claim-evidence-links.ts` — link repo.
- `lib/db/repositories/health-snapshots.ts` — snapshot repo + `persistHealthForRun`.
- `lib/inngest/functions/evaluate-run.ts` — the Inngest function.
- `__fixtures__/agent-runs/nvda-happy-path/evaluations.json` — cycled evaluator verdicts.
- `lib/ai/evaluation-fixtures.ts` — `EvaluationFixtureReader`.

**Modify:**
- `lib/db/schema.ts` — add `evidence_impact` enum + `claimEvidenceLinks` + `thesisHealthSnapshots` tables + types.
- `lib/ai/client.ts` — extend `createMessage` params with `model`/`toolChoice`/`thinking`/`maxTokens` overrides; add `EVALUATOR_MODEL`.
- `lib/inngest/client.ts` — add `AgentRunCompleted` event type.
- `lib/inngest/functions/run-agent.ts` — emit `agent-run.completed` after a successful run with evidence.
- `app/api/inngest/route.ts` — register `evaluateRun`.
- `scripts/run-agent-fixture.ts` — after the run, drive the evaluation pipeline and print link/snapshot counts.

---

## Task 1: `evidence_impact` enum + client-safe tuple + drift guard

**Files:**
- Create: `schemas/evidence.ts`
- Modify: `lib/db/schema.ts` (add enum near the other `pgEnum`s, ~line 34)
- Create: `lib/db/evidence-enum-sync.test.ts`

- [ ] **Step 1: Create the client-safe tuple**

`schemas/evidence.ts`:
```ts
// Enum value tuple — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here (no server imports). The drift-guard test asserts they match.
export const EVIDENCE_IMPACTS = ["strengthens", "neutral", "weakens"] as const;
export type EvidenceImpact = (typeof EVIDENCE_IMPACTS)[number];
```

- [ ] **Step 2: Add the pgEnum**

In `lib/db/schema.ts`, after the `agentRunTrigger` enum (around line 105) add:
```ts
export const evidenceImpact = pgEnum("evidence_impact", ["strengthens", "neutral", "weakens"]);
```

- [ ] **Step 3: Write the drift-guard test**

`lib/db/evidence-enum-sync.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { EVIDENCE_IMPACTS } from "@/schemas/evidence";
import { evidenceImpact } from "@/lib/db/schema";

describe("evidence_impact enum sync", () => {
  it("pgEnum matches the client-safe tuple", () => {
    expect([...evidenceImpact.enumValues]).toEqual([...EVIDENCE_IMPACTS]);
  });
});
```

- [ ] **Step 4: Run typecheck + the test**

Run: `npm run typecheck && nvm use 22 >/dev/null && npx vitest run lib/db/evidence-enum-sync.test.ts`
Expected: typecheck clean; test PASS.

- [ ] **Step 5: Commit** (after approval)

```bash
git add schemas/evidence.ts lib/db/schema.ts lib/db/evidence-enum-sync.test.ts
git commit -m "feat: add evidence_impact enum with client-safe tuple and drift guard"
```

---

## Task 2: `claim_evidence_links` + `thesis_health_snapshots` schema

**Files:**
- Modify: `lib/db/schema.ts` (add tables after the `evidence` table, ~line 185; add types after line 190)

- [ ] **Step 1: Add the two tables**

In `lib/db/schema.ts`, after the `evidence` table definition add:
```ts
export const claimEvidenceLinks = pgTable(
  "claim_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    impact: evidenceImpact("impact").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    reasoning: text("reasoning").notNull(),
    evaluatorPromptVersion: text("evaluator_prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("claim_evidence_links_pair_idx").on(t.claimId, t.evidenceId),
    index("claim_evidence_links_claim_id_idx").on(t.claimId),
  ],
);

export const thesisHealthSnapshots = pgTable(
  "thesis_health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    overallScore: numeric("overall_score", { precision: 3, scale: 2 }).notNull(),
    claimScores: jsonb("claim_scores").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("thesis_health_snapshots_run_idx").on(t.agentRunId),
    index("thesis_health_snapshots_thesis_recorded_idx").on(t.thesisId, t.recordedAt),
  ],
);
```

- [ ] **Step 2: Ensure imports**

At the top of `lib/db/schema.ts`, confirm `uniqueIndex` and `jsonb` are imported from `drizzle-orm/pg-core` (add them to the existing import list if missing — `numeric`, `vector`, `index`, `text`, `timestamp`, `uuid`, `integer` are already imported).

- [ ] **Step 3: Add the inferred types**

After the existing `export type Evidence = ...` (line 190) add:
```ts
export type ClaimEvidenceLink = typeof claimEvidenceLinks.$inferSelect;
export type NewClaimEvidenceLink = typeof claimEvidenceLinks.$inferInsert;
export type ThesisHealthSnapshot = typeof thesisHealthSnapshots.$inferSelect;
export type NewThesisHealthSnapshot = typeof thesisHealthSnapshots.$inferInsert;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit** (after approval)

```bash
git add lib/db/schema.ts
git commit -m "feat: add claim_evidence_links and thesis_health_snapshots tables"
```

---

## Task 3: Generate and apply the migration

**Files:**
- Create: `drizzle/<generated>.sql` (drizzle-kit output)

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: a new SQL file in `drizzle/` creating the `evidence_impact` type and both tables with the unique/index constraints. Read it to confirm it matches Task 2 (no unexpected drops).

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: applies cleanly against the dev DB (needs `DATABASE_URL` in `.env.local`).

> If the dev DB is unreachable in the execution environment, stop and report BLOCKED — do not hand-edit the generated SQL. Migrations are applied by the human.

- [ ] **Step 3: Commit** (after approval)

```bash
git add drizzle/
git commit -m "chore: generate migration for evidence links and health snapshots"
```

---

## Task 4: Health calculation (`lib/health/`)

**Files:**
- Create: `lib/health/score.ts`
- Create: `lib/health/score.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/health/score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decayWeight, impactValue, claimHealth, thesisHealth, HALF_LIFE_DAYS } from "./score";

const DAY = 86_400_000;

describe("decayWeight", () => {
  it("is 1 at age 0 and 0.5 at one half-life", () => {
    expect(decayWeight(0)).toBeCloseTo(1, 6);
    expect(decayWeight(HALF_LIFE_DAYS * DAY)).toBeCloseTo(0.5, 6);
  });
});

describe("impactValue", () => {
  it("maps impacts to +1 / 0 / -1", () => {
    expect(impactValue("strengthens")).toBe(1);
    expect(impactValue("neutral")).toBe(0);
    expect(impactValue("weakens")).toBe(-1);
  });
});

describe("claimHealth", () => {
  const now = new Date("2026-06-13T00:00:00Z");
  it("returns 0 when there are no links", () => {
    expect(claimHealth([], now)).toBe(0);
  });
  it("is +1 for a single full-confidence strengthens at age 0", () => {
    expect(claimHealth([{ impact: "strengthens", confidence: 1, createdAt: now }], now)).toBeCloseTo(1, 6);
  });
  it("neutral evidence pulls a strengthens toward 0", () => {
    const links = [
      { impact: "strengthens" as const, confidence: 1, createdAt: now },
      { impact: "neutral" as const, confidence: 1, createdAt: now },
    ];
    expect(claimHealth(links, now)).toBeCloseTo(0.5, 6);
  });
  it("stays within [-1, 1]", () => {
    const links = [
      { impact: "weakens" as const, confidence: 1, createdAt: now },
      { impact: "weakens" as const, confidence: 1, createdAt: now },
    ];
    expect(claimHealth(links, now)).toBeCloseTo(-1, 6);
  });
});

describe("thesisHealth", () => {
  it("is the mean of claim scores, 0 when empty", () => {
    expect(thesisHealth([])).toBe(0);
    expect(thesisHealth([1, 0, -1])).toBeCloseTo(0, 6);
    expect(thesisHealth([0.5, 0.5])).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `nvm use 22 >/dev/null && npx vitest run lib/health/score.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/health/score.ts`:
```ts
import type { EvidenceImpact } from "@/schemas/evidence";

export const HALF_LIFE_DAYS = 90;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 86_400_000;

export function decayWeight(ageMs: number, halfLifeMs: number = HALF_LIFE_MS): number {
  return 0.5 ** (Math.max(0, ageMs) / halfLifeMs);
}

export function impactValue(impact: EvidenceImpact): number {
  return impact === "strengthens" ? 1 : impact === "weakens" ? -1 : 0;
}

export function claimHealth(
  links: { impact: EvidenceImpact; confidence: number; createdAt: Date }[],
  now: Date,
): number {
  let weighted = 0;
  let weight = 0;
  for (const l of links) {
    const w = l.confidence * decayWeight(now.getTime() - new Date(l.createdAt).getTime());
    weighted += impactValue(l.impact) * w;
    weight += w;
  }
  if (weight === 0) return 0;
  const score = weighted / weight;
  return Math.max(-1, Math.min(1, score));
}

export function thesisHealth(claimScores: number[]): number {
  if (claimScores.length === 0) return 0;
  return claimScores.reduce((a, b) => a + b, 0) / claimScores.length;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/health/score.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit** (after approval)

```bash
git add lib/health/score.ts lib/health/score.test.ts
git commit -m "feat: add deterministic claim/thesis health calculation"
```

---

## Task 5: Evaluation schema + `return_evaluation` tool

**Files:**
- Create: `lib/ai/schemas/evaluation.ts`
- Create: `lib/ai/schemas/evaluation.test.ts`
- Create: `lib/ai/tools/return-evaluation.ts`

- [ ] **Step 1: Write the failing schema test**

`lib/ai/schemas/evaluation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { EvaluationSchema } from "./evaluation";

describe("EvaluationSchema", () => {
  it("accepts a valid verdict", () => {
    const ok = { impact: "strengthens", confidence: 0.8, reasoning: "Revenue beat confirms demand." };
    expect(EvaluationSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects confidence out of range", () => {
    expect(EvaluationSchema.safeParse({ impact: "neutral", confidence: 1.5, reasoning: "x" }).success).toBe(false);
  });
  it("rejects an unknown impact", () => {
    expect(EvaluationSchema.safeParse({ impact: "boosts", confidence: 0.5, reasoning: "x" }).success).toBe(false);
  });
  it("rejects empty reasoning", () => {
    expect(EvaluationSchema.safeParse({ impact: "weakens", confidence: 0.5, reasoning: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/ai/schemas/evaluation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the schema**

`lib/ai/schemas/evaluation.ts`:
```ts
import { z } from "zod";
import { EVIDENCE_IMPACTS } from "@/schemas/evidence";

export const EvaluationSchema = z.object({
  impact: z.enum(EVIDENCE_IMPACTS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export type EvaluationResult = z.infer<typeof EvaluationSchema>;
```

- [ ] **Step 4: Implement the tool**

`lib/ai/tools/return-evaluation.ts`:
```ts
import "server-only";
import { EvaluationSchema, type EvaluationResult } from "@/lib/ai/schemas/evaluation";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the evaluator; execute() is a no-op echo so the
// tool conforms to the Tool interface.
export const returnEvaluationTool: Tool<EvaluationResult> = {
  name: "return_evaluation",
  description:
    "Return your judgment of whether this single piece of evidence strengthens, weakens, or does not " +
    "affect this single claim. Be conservative: choose 'neutral' with low confidence unless the evidence " +
    "clearly bears on the claim.",
  inputSchema: EvaluationSchema,
  async execute(input: EvaluationResult): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `npx vitest run lib/ai/schemas/evaluation.test.ts && npm run typecheck`
Expected: test PASS; typecheck clean.

- [ ] **Step 6: Commit** (after approval)

```bash
git add lib/ai/schemas/evaluation.ts lib/ai/schemas/evaluation.test.ts lib/ai/tools/return-evaluation.ts
git commit -m "feat: add evaluation schema and return_evaluation tool"
```

---

## Task 6: Extend the Anthropic client for the evaluator

The shared `createMessage` is hardcoded to Opus + adaptive thinking with no `tool_choice`. The evaluator needs a different model, forced tool choice, and thinking off. Extend the params with optional overrides — fully backward compatible (the researcher passes none).

> **Before implementing:** use the `claude-api` skill (or Context7 for `@anthropic-ai/sdk`) to confirm the exact request shape for **forced `tool_choice` with `claude-sonnet-4-6`** and that extended thinking should be omitted when forcing a tool. Adjust the literal below if the skill says otherwise; keep the override-params surface the same.

**Files:**
- Modify: `lib/ai/client.ts`

- [ ] **Step 1: Extend the param type and add the model constant**

In `lib/ai/client.ts`, replace the `AnthropicLike` type with:
```ts
export const CURRENT_MODEL = "claude-opus-4-8";
export const EVALUATOR_MODEL = "claude-sonnet-4-6";

export type CreateMessageParams = {
  system: string;
  tools: { name: string; description: string; input_schema: unknown }[];
  messages: Anthropic.MessageParam[];
  model?: string;
  toolChoice?: { type: "tool"; name: string };
  thinking?: boolean; // default true (adaptive); false → omit thinking
  maxTokens?: number;
};

export type AnthropicLike = {
  createMessage(params: CreateMessageParams): Promise<Anthropic.Message>;
};
```

- [ ] **Step 2: Apply the overrides in `createAnthropicClient`**

Replace the `createMessage` body with:
```ts
async createMessage({ system, tools, messages, model, toolChoice, thinking = true, maxTokens = 8192 }) {
  const params: Record<string, unknown> = {
    model: model ?? CURRENT_MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
      ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
    })),
    messages,
  };
  // Adaptive thinking is incompatible with forcing a specific tool; the
  // evaluator passes thinking:false + toolChoice for a deterministic one-shot.
  if (thinking) {
    params.thinking = { type: "adaptive", display: "summarized" };
    params.output_config = { effort: "medium" };
  }
  if (toolChoice) params.tool_choice = toolChoice;
  return sdk.messages.create(params as Anthropic.MessageCreateParamsNonStreaming);
}
```

- [ ] **Step 3: Typecheck + run existing AI tests**

Run: `npm run typecheck && npx vitest run lib/ai`
Expected: clean; existing tests still pass (researcher path unchanged — defaults preserve Opus + adaptive thinking).

- [ ] **Step 4: Commit** (after approval)

```bash
git add lib/ai/client.ts
git commit -m "feat: allow model/tool_choice/thinking overrides in Anthropic client"
```

---

## Task 7: Evaluator agent + prompt

**Files:**
- Create: `lib/ai/prompts/evaluator.ts`
- Create: `lib/ai/agents/evaluator.ts`
- Create: `lib/ai/agents/evaluator.test.ts`

- [ ] **Step 1: Write the prompt**

`lib/ai/prompts/evaluator.ts`:
```ts
// Bump this when the prompt below changes — stored on each link so stale
// verdicts can be re-evaluated. (lib/db/repositories/claim-evidence-links.ts)
export const EVALUATOR_PROMPT_VERSION = "eval-v1";

export const systemPrompt = `You are an evidence evaluator for an investment-thesis tracker. You are given ONE claim from a thesis and ONE piece of evidence. Decide whether the evidence strengthens, weakens, or does not affect the claim.

Rules:
- Judge ONLY the evidence in front of you. Do not speculate beyond it or use outside knowledge of the company.
- Be conservative. Default to "neutral" with low confidence unless the evidence clearly bears on this specific claim.
- "strengthens" = the evidence makes the claim more likely true. "weakens" = more likely false. "neutral" = not relevant or inconclusive.
- confidence (0–1) reflects how strongly the evidence bears on the claim, not how confident you are that the claim is true overall.
- Keep reasoning to 1–2 sentences, specific to this claim and this evidence.
- You MUST respond by calling the return_evaluation tool.`;

export function buildEvaluationTask(
  claim: { statement: string; category: string },
  evidence: { extractedText: string; sourceDomain?: string },
): string {
  return [
    `CLAIM (category: ${claim.category}):`,
    claim.statement,
    "",
    `EVIDENCE${evidence.sourceDomain ? ` (source: ${evidence.sourceDomain})` : ""}:`,
    evidence.extractedText,
  ].join("\n");
}
```

- [ ] **Step 2: Write the failing evaluator test**

`lib/ai/agents/evaluator.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { evaluate } from "./evaluator";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({
        content: [{ type: "tool_use", name: "return_evaluation", id: "t1", input }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as unknown as Anthropic.Message,
  };
}

const claim = { statement: "Data-center revenue keeps growing", category: "growth" };
const ev = { extractedText: "Q3 data-center revenue rose 40% YoY." };

describe("evaluate", () => {
  it("returns the validated verdict from the tool call", async () => {
    const client = clientReturning({ impact: "strengthens", confidence: 0.8, reasoning: "40% growth supports it." });
    const res = await evaluate(claim, ev, { client });
    expect(res).toEqual({ impact: "strengthens", confidence: 0.8, reasoning: "40% growth supports it." });
  });

  it("falls back to neutral/0 when the tool output is malformed", async () => {
    const client = clientReturning({ impact: "boosts", confidence: 2 });
    const res = await evaluate(claim, ev, { client });
    expect(res.impact).toBe("neutral");
    expect(res.confidence).toBe(0);
    expect(res.reasoning).toMatch(/validation/i);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/ai/agents/evaluator.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the evaluator**

`lib/ai/agents/evaluator.ts`:
```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { EVALUATOR_MODEL, type AnthropicLike } from "@/lib/ai/client";
import { EvaluationSchema, type EvaluationResult } from "@/lib/ai/schemas/evaluation";
import { returnEvaluationTool } from "@/lib/ai/tools/return-evaluation";
import { systemPrompt, buildEvaluationTask } from "@/lib/ai/prompts/evaluator";

const tools = [
  {
    name: returnEvaluationTool.name,
    description: returnEvaluationTool.description,
    input_schema: z.toJSONSchema(returnEvaluationTool.inputSchema) as unknown,
  },
];

export async function evaluate(
  claim: { statement: string; category: string },
  evidence: { extractedText: string; sourceDomain?: string },
  deps: { client: AnthropicLike },
): Promise<EvaluationResult> {
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildEvaluationTask(claim, evidence) }],
    model: EVALUATOR_MODEL,
    toolChoice: { type: "tool", name: "return_evaluation" },
    thinking: false,
    maxTokens: 1024,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_evaluation",
  );
  const parsed = EvaluationSchema.safeParse(toolUse?.input);
  if (!parsed.success) {
    return { impact: "neutral", confidence: 0, reasoning: "Evaluator output failed schema validation." };
  }
  return parsed.data;
}
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `npx vitest run lib/ai/agents/evaluator.test.ts && npm run typecheck`
Expected: both PASS / clean.

- [ ] **Step 6: Commit** (after approval)

```bash
git add lib/ai/prompts/evaluator.ts lib/ai/agents/evaluator.ts lib/ai/agents/evaluator.test.ts
git commit -m "feat: add one-shot evaluator agent and prompt"
```

---

## Task 8: Repositories (links + snapshots + health persist)

**Files:**
- Create: `lib/db/repositories/claim-evidence-links.ts`
- Create: `lib/db/repositories/health-snapshots.ts`

- [ ] **Step 1: Link repository**

`lib/db/repositories/claim-evidence-links.ts`:
```ts
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { claimEvidenceLinks, type ClaimEvidenceLink } from "@/lib/db/schema";
import type { EvidenceImpact } from "@/schemas/evidence";

export async function findCachedLink(
  claimId: string,
  evidenceId: string,
  promptVersion: string,
): Promise<ClaimEvidenceLink | null> {
  const [row] = await db
    .select()
    .from(claimEvidenceLinks)
    .where(
      and(
        eq(claimEvidenceLinks.claimId, claimId),
        eq(claimEvidenceLinks.evidenceId, evidenceId),
        eq(claimEvidenceLinks.evaluatorPromptVersion, promptVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertEvaluation(input: {
  claimId: string;
  evidenceId: string;
  impact: EvidenceImpact;
  confidence: number;
  reasoning: string;
  evaluatorPromptVersion: string;
}): Promise<void> {
  await db
    .insert(claimEvidenceLinks)
    .values({
      claimId: input.claimId,
      evidenceId: input.evidenceId,
      impact: input.impact,
      confidence: String(input.confidence),
      reasoning: input.reasoning,
      evaluatorPromptVersion: input.evaluatorPromptVersion,
    })
    .onConflictDoUpdate({
      target: [claimEvidenceLinks.claimId, claimEvidenceLinks.evidenceId],
      set: {
        impact: input.impact,
        confidence: String(input.confidence),
        reasoning: input.reasoning,
        evaluatorPromptVersion: input.evaluatorPromptVersion,
        updatedAt: new Date(),
      },
    });
}

export async function listLinksForClaim(claimId: string): Promise<ClaimEvidenceLink[]> {
  return db.select().from(claimEvidenceLinks).where(eq(claimEvidenceLinks.claimId, claimId));
}

export async function listLinksForEvidenceIds(evidenceIds: string[]): Promise<ClaimEvidenceLink[]> {
  if (evidenceIds.length === 0) return [];
  return db.select().from(claimEvidenceLinks).where(inArray(claimEvidenceLinks.evidenceId, evidenceIds));
}
```

- [ ] **Step 2: Snapshot repository + health persist**

`lib/db/repositories/health-snapshots.ts`:
```ts
import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { claims, thesisHealthSnapshots, type ThesisHealthSnapshot } from "@/lib/db/schema";

export type ClaimScore = { claimId: string; ordinal: number; score: number };

// All-or-nothing: update every claim's denormalized health + write one snapshot
// for the run. neon-http has no interactive transactions, so use db.batch().
export async function persistHealthForRun(input: {
  thesisId: string;
  agentRunId: string;
  recordedAt: Date;
  overallScore: number;
  claimScores: ClaimScore[];
}): Promise<void> {
  const now = new Date();
  const statements = [
    ...input.claimScores.map((cs) =>
      db
        .update(claims)
        .set({ currentHealthScore: String(cs.score), currentHealthUpdatedAt: now })
        .where(eq(claims.id, cs.claimId)),
    ),
    db
      .insert(thesisHealthSnapshots)
      .values({
        thesisId: input.thesisId,
        agentRunId: input.agentRunId,
        recordedAt: input.recordedAt,
        overallScore: String(input.overallScore),
        claimScores: input.claimScores,
      })
      .onConflictDoUpdate({
        target: thesisHealthSnapshots.agentRunId,
        set: { overallScore: String(input.overallScore), claimScores: input.claimScores, updatedAt: now },
      }),
  ];
  // claimScores is always non-empty (a thesis has 2–5 claims); db.batch needs a
  // non-empty tuple, which we assert via the param type.
  type BatchArg = Parameters<typeof db.batch>[0];
  await db.batch(statements as unknown as BatchArg);
}

export async function listSnapshotsForThesis(thesisId: string): Promise<ThesisHealthSnapshot[]> {
  return db
    .select()
    .from(thesisHealthSnapshots)
    .where(eq(thesisHealthSnapshots.thesisId, thesisId))
    .orderBy(desc(thesisHealthSnapshots.recordedAt));
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit** (after approval)

```bash
git add lib/db/repositories/claim-evidence-links.ts lib/db/repositories/health-snapshots.ts
git commit -m "feat: add claim-evidence-link and health-snapshot repositories"
```

---

## Task 9: Evaluation pipeline (shared core)

Extract the matrix-eval and recompute-and-persist logic so both the Inngest function and the offline harness call the exact same code (DRY).

**Files:**
- Create: `lib/ai/evaluate-pipeline.ts`

- [ ] **Step 1: Implement the pipeline**

`lib/ai/evaluate-pipeline.ts`:
```ts
import "server-only";
import type { AnthropicLike } from "@/lib/ai/client";
import { evaluate } from "@/lib/ai/agents/evaluator";
import { EVALUATOR_PROMPT_VERSION } from "@/lib/ai/prompts/evaluator";
import { findCachedLink, upsertEvaluation, listLinksForClaim } from "@/lib/db/repositories/claim-evidence-links";
import { persistHealthForRun, type ClaimScore } from "@/lib/db/repositories/health-snapshots";
import { claimHealth, thesisHealth } from "@/lib/health/score";

export type PipelineClaim = { id: string; ordinal: number; statement: string; category: string };
export type PipelineEvidence = { id: string; extractedText: string; sourceDomain?: string };

// Evaluate every (claim, evidence) pair not already cached at the current prompt
// version. Idempotent: re-running skips pairs that already have a current verdict.
export async function evaluateMatrix(input: {
  claims: PipelineClaim[];
  evidence: PipelineEvidence[];
  client: AnthropicLike;
}): Promise<number> {
  let evaluated = 0;
  for (const claim of input.claims) {
    for (const ev of input.evidence) {
      const cached = await findCachedLink(claim.id, ev.id, EVALUATOR_PROMPT_VERSION);
      if (cached) continue;
      const verdict = await evaluate(
        { statement: claim.statement, category: claim.category },
        { extractedText: ev.extractedText, sourceDomain: ev.sourceDomain },
        { client: input.client },
      );
      await upsertEvaluation({
        claimId: claim.id,
        evidenceId: ev.id,
        impact: verdict.impact,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        evaluatorPromptVersion: EVALUATOR_PROMPT_VERSION,
      });
      evaluated++;
    }
  }
  return evaluated;
}

// Recompute each claim's health from its full link history (decayed to `now`),
// then persist claim scores + one thesis snapshot for the run.
export async function recomputeAndPersist(input: {
  thesisId: string;
  agentRunId: string;
  claims: PipelineClaim[];
  now?: Date;
}): Promise<{ overallScore: number }> {
  const now = input.now ?? new Date();
  const claimScores: ClaimScore[] = [];
  for (const claim of input.claims) {
    const links = await listLinksForClaim(claim.id);
    const score = claimHealth(
      links.map((l) => ({ impact: l.impact, confidence: Number(l.confidence), createdAt: l.createdAt })),
      now,
    );
    claimScores.push({ claimId: claim.id, ordinal: claim.ordinal, score });
  }
  const overallScore = thesisHealth(claimScores.map((c) => c.score));
  await persistHealthForRun({ thesisId: input.thesisId, agentRunId: input.agentRunId, recordedAt: now, overallScore, claimScores });
  return { overallScore };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** (after approval)

```bash
git add lib/ai/evaluate-pipeline.ts
git commit -m "feat: add shared evaluate/recompute pipeline"
```

---

## Task 10: Inngest `evaluate-run` function + emit + registration

**Files:**
- Modify: `lib/inngest/client.ts`
- Create: `lib/inngest/functions/evaluate-run.ts`
- Modify: `lib/inngest/functions/run-agent.ts`
- Modify: `app/api/inngest/route.ts`
- Create: `lib/ai/evaluation-fixtures.ts`

> **Before implementing the emit step:** confirm via Context7 (`inngest`) that `step.sendEvent(id, { name, data })` is the v4.5.1 API for emitting an event from inside a function. If the installed version differs, use the documented equivalent — keep the event name `agent-run.completed` and the data payload identical.

- [ ] **Step 1: Add the event type**

In `lib/inngest/client.ts`, after `AgentRunRequested` add:
```ts
export type AgentRunCompleted = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string };
};
```

- [ ] **Step 2: Add the fixture reader**

`lib/ai/evaluation-fixtures.ts`:
```ts
import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline evaluator replay. The verdict list is CYCLED (not 1:1 with pairs) so
// the harness works for any claim×evidence count and exercises mixed impacts.
// Each entry is a full Anthropic message with a return_evaluation tool_use block.
export class EvaluationFixtureReader {
  private items: unknown[];
  private idx = 0;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "evaluations.json");
    if (!existsSync(path)) throw new Error(`Evaluation fixture not found: ${scenario} (${path})`);
    this.items = JSON.parse(readFileSync(path, "utf8")) as unknown[];
    if (this.items.length === 0) throw new Error(`Evaluation fixture is empty: ${scenario}`);
  }
  next(): unknown {
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    return item;
  }
}
```

- [ ] **Step 3: Write the fixture data**

`__fixtures__/agent-runs/nvda-happy-path/evaluations.json` (cycled; mix of impacts so health math is non-trivial):
```json
[
  { "content": [{ "type": "tool_use", "id": "e1", "name": "return_evaluation", "input": { "impact": "strengthens", "confidence": 0.8, "reasoning": "Directly supports the growth claim." } }], "usage": { "input_tokens": 220, "output_tokens": 40 } },
  { "content": [{ "type": "tool_use", "id": "e2", "name": "return_evaluation", "input": { "impact": "neutral", "confidence": 0.2, "reasoning": "Not clearly related to this claim." } }], "usage": { "input_tokens": 210, "output_tokens": 38 } },
  { "content": [{ "type": "tool_use", "id": "e3", "name": "return_evaluation", "input": { "impact": "weakens", "confidence": 0.6, "reasoning": "Suggests headwinds against the claim." } }], "usage": { "input_tokens": 230, "output_tokens": 41 } }
]
```

- [ ] **Step 4: Implement the Inngest function**

`lib/inngest/functions/evaluate-run.ts`:
```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { inngest, type AgentRunCompleted } from "@/lib/inngest/client";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { serverEnv } from "@/lib/env.server";

export const evaluateRun = inngest.createFunction(
  { id: "evaluate-run", retries: 2, triggers: [{ event: "agent-run.completed" }] },
  async ({ event, step }) => {
    const { agentRunId, thesisId, userId, scenario } = event.data as AgentRunCompleted["data"];

    const thesis = await step.run("load-thesis", () => getThesisForUser(userId, thesisId));
    if (!thesis) return { status: "skipped" as const };
    const evidence = await step.run("load-evidence", () => listEvidenceForRun(agentRunId));
    if (evidence.length === 0) return { status: "no-evidence" as const };

    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const reader = useFixtures ? new EvaluationFixtureReader(scenario ?? "nvda-happy-path") : null;
    const client: AnthropicLike = useFixtures
      ? { createMessage: async () => reader!.next() as Anthropic.Message }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);

    const srcRows = await step.run("load-sources", () =>
      getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]),
    );
    const domainById = new Map(srcRows.map((s) => [s.id, s.domain]));

    // One step: caching makes retries cheap and idempotent (no nested steps).
    await step.run("evaluate-matrix", () =>
      evaluateMatrix({
        claims: thesis.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category })),
        evidence: evidence.map((e) => ({ id: e.id, extractedText: e.extractedText, sourceDomain: domainById.get(e.sourceId) })),
        client,
      }),
    );

    await step.run("recompute-health", () =>
      recomputeAndPersist({
        thesisId,
        agentRunId,
        claims: thesis.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category })),
      }),
    );

    return { status: "evaluated" as const, pairs: thesis.claims.length * evidence.length };
  },
);
```

- [ ] **Step 5: Emit the event from `run-agent`**

In `lib/inngest/functions/run-agent.ts`, after the `finishRun(...)` call (line ~96-100) and before `return { status: result.status }`, add:
```ts
    // Kick off evaluation only when the run actually produced evidence.
    if (result.status !== "failed" && result.evidenceCount > 0) {
      await step.sendEvent("emit-agent-run-completed", {
        name: "agent-run.completed",
        data: { agentRunId, thesisId, userId, scenario },
      });
    }
```

- [ ] **Step 6: Register the function in the serve route**

In `app/api/inngest/route.ts`:
```ts
import { evaluateRun } from "@/lib/inngest/functions/evaluate-run";
// ...
export const { GET, POST, PUT } = serve({ client: inngest, functions: [runAgent, evaluateRun] });
```

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit** (after approval)

```bash
git add lib/inngest/client.ts lib/inngest/functions/evaluate-run.ts lib/inngest/functions/run-agent.ts app/api/inngest/route.ts lib/ai/evaluation-fixtures.ts __fixtures__/agent-runs/nvda-happy-path/evaluations.json
git commit -m "feat: add evaluate-run Inngest function triggered after agent runs"
```

---

## Task 11: Extend the offline harness + verify end-to-end

**Files:**
- Modify: `scripts/run-agent-fixture.ts`

- [ ] **Step 1: Drive the pipeline after the run**

In `scripts/run-agent-fixture.ts`, add imports near the top:
```ts
import { listLinksForClaim } from "@/lib/db/repositories/claim-evidence-links";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
```

Then, after the existing `const ev = await listEvidenceForRun(run.id);` (just before the final `console.log`), add:
```ts
  // --- Evaluation pipeline (offline, fixture-backed) ---
  const evalReader = new EvaluationFixtureReader(scenario);
  const evalClient: AnthropicLike = {
    createMessage: async () => evalReader.next() as Anthropic.Message,
  };
  const pipelineClaims = cs.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category }));
  const pairs = await evaluateMatrix({
    claims: pipelineClaims,
    evidence: ev.map((e) => ({ id: e.id, extractedText: e.extractedText })),
    client: evalClient,
  });
  const { overallScore } = await recomputeAndPersist({ thesisId: thesis.id, agentRunId: run.id, claims: pipelineClaims });
  const linkCounts = await Promise.all(pipelineClaims.map((c) => listLinksForClaim(c.id).then((l) => l.length)));
  const snapshots = await listSnapshotsForThesis(thesis.id);
```

Update the final `console.log` object to include:
```ts
      { scenario, runId: run.id, status: result.status, iterations: its.length, evidence: ev.length,
        pairsEvaluated: pairs, linksPerClaim: linkCounts, overallScore, snapshots: snapshots.length },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Run the offline harness end-to-end**

Requires Node 22, a thesis in the dev DB, and `.env.local`:
```bash
nvm use 22 >/dev/null
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local --import tsx scripts/run-agent-fixture.ts nvda-happy-path
```
Expected JSON shows `evidence > 0`, `pairsEvaluated = claims × evidence`, every entry in `linksPerClaim` equal to `evidence`, `overallScore` a number in [-1, 1], and `snapshots >= 1`. Re-running it should keep `pairsEvaluated` at 0 (all pairs cached) while `snapshots` stays 1 for that run.

> If the dev DB is unreachable here, report the typecheck result and mark the live run BLOCKED for the human to execute — do not fake the output.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all suites pass (existing + the new health/schema/evaluator tests).

- [ ] **Step 5: Commit** (after approval)

```bash
git add scripts/run-agent-fixture.ts
git commit -m "test: drive evaluation pipeline in the offline fixtured harness"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Schema `claim_evidence_links` + `evidence_impact` enum → Tasks 1–3. ✓
- `thesis_health_snapshots` (snapshot-per-run, JSONB per-claim) → Tasks 2–3, 8. ✓
- Evaluator agent (one-shot, Sonnet 4.6, forced tool, Zod, conservative prompt, prompt version) → Tasks 5–7. ✓
- `lib/health/` weighted-average + 90-day decay + neutral-0 default → Task 4. ✓
- `evaluate-run` Inngest fn triggered by `agent-run.completed`, full matrix, caching, batch writes → Tasks 9–10. ✓
- Fixtures + offline end-to-end test → Tasks 10–11. ✓
- Repositories for links + snapshots + claim health update → Task 8. ✓
- Error handling (malformed → neutral/0; empty evidence → no-op) → Tasks 7, 10. ✓
- Enum drift guard → Task 1. ✓
- 4b UI is correctly excluded.

**Placeholder scan:** No TBD/TODO; every code step has complete code; two external-API shape checks are explicit (claude-api skill for forced tool_choice in Task 6; Context7 for `step.sendEvent` in Task 10) rather than guesses.

**Type consistency:** `EvidenceImpact`, `EvaluationResult`, `ClaimScore`, `EVALUATOR_PROMPT_VERSION`, `PipelineClaim`/`PipelineEvidence`, and the `createMessage` override params are defined once and reused consistently across tasks. Numeric↔string conversions (`confidence`, `overallScore`, `currentHealthScore`) are handled at every DB boundary.
