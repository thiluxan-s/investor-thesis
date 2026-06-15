# Phase 6a — AI Thesis Drafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "From a paragraph" mode in the new-thesis flow: a one-shot drafter agent turns the user's free-text reasoning into 2–7 candidate claims (statement + category + source excerpt) that the user reviews, selectively adds, edits, and saves through the existing creation path.

**Architecture:** A new `drafter` agent — one-shot, forced `return_drafted_claims` tool, Opus 4.8, fixture-backed — mirrors the evaluator/summarizer. A `draftClaimsFromParagraph` Server Action validates input and calls it (does not save). The new-thesis wizard's claims step gains a segmented Manual/From-paragraph control; a `ParagraphDrafter` client component renders the drafted claims as a review list with per-claim "Add", pushing `ClaimInput`s into the wizard's existing `claims` state.

**Tech Stack:** Next.js 16 (Server Actions + Client Components), TypeScript (strict), Anthropic SDK (`claude-opus-4-8`, forced `tool_choice`), Zod v4, Motion, Vitest (Node 22).

**Conventions (from CLAUDE.md):** no `any`; Zod is the source of truth (`z.infer`); all AI output validated with Zod; force structured output via a single tool; prompts in `lib/ai/prompts/`; agents in `lib/ai/agents/`; fixtures mandatory in dev (`USE_AI_FIXTURES`); Server Actions return `ActionResult`, never throw across the boundary; absolute `@/` imports; `npm run typecheck` + `npm run lint` before every commit; tests need Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

**Refinement over the spec (intentional):** §7's "merge drafted claims into the shared state" is implemented as a **review-and-add** UX — drafted claims render in `ParagraphDrafter` with their source excerpt and a per-claim "Add" button; adding pushes a `ClaimInput` into the wizard's `claims`. This keeps the excerpt visible during review and matches the phase doc's "review, edit, and select 2–5 to save." The wizard remains the single owner of `claims`.

**Approval workflow:** explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, wait for approval.

---

## File Structure

**Create:** `lib/ai/schemas/drafter.ts` (+test), `lib/ai/tools/return-drafted-claims.ts`, `lib/ai/prompts/drafter.ts`, `lib/ai/agents/drafter.ts` (+test), `lib/ai/drafter-fixtures.ts`, `__fixtures__/agent-runs/nvda-happy-path/drafter.json`, `components/theses/ParagraphDrafter.tsx`.

**Modify:** `schemas/thesis.ts` (`DraftRequestSchema`), `app/(app)/theses/agent-actions.ts` (`draftClaimsFromParagraph`), `components/theses/NewThesisWizard.tsx` (tabbed claims step), `docs/DESIGN.md`.

---

## Task 1: Drafter schema + `return_drafted_claims` tool (TDD)

**Files:** Create `lib/ai/schemas/drafter.ts`, `lib/ai/schemas/drafter.test.ts`, `lib/ai/tools/return-drafted-claims.ts`.

- [ ] **Step 1: Failing test** — `lib/ai/schemas/drafter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DraftedClaimsSchema } from "./drafter";

describe("DraftedClaimsSchema", () => {
  it("accepts valid drafted claims", () => {
    const ok = { claims: [{ statement: "Data-center revenue keeps growing", category: "financial_performance", sourceExcerpt: "revenue keeps growing" }] };
    expect(DraftedClaimsSchema.safeParse(ok).success).toBe(true);
  });
  it("accepts an empty claims array", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [] }).success).toBe(true);
  });
  it("allows an empty sourceExcerpt", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ statement: "x", category: "other", sourceExcerpt: "" }] }).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ statement: "x", category: "vibes", sourceExcerpt: "" }] }).success).toBe(false);
  });
  it("rejects a missing statement", () => {
    expect(DraftedClaimsSchema.safeParse({ claims: [{ category: "other", sourceExcerpt: "" }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/ai/schemas/drafter.test.ts` → FAIL (module not found).

- [ ] **Step 3: Schema** — `lib/ai/schemas/drafter.ts`:
```ts
import { z } from "zod";
import { CLAIM_CATEGORIES } from "@/schemas/thesis";

// Lenient on length: the user edits before saving, and CreateThesisSchema
// enforces the real 10–300 / 2–5 constraints at save time.
export const DraftedClaimSchema = z.object({
  statement: z.string().min(1).max(500),
  category: z.enum(CLAIM_CATEGORIES),
  sourceExcerpt: z.string(), // verbatim substring of the user's paragraph; may be ""
});

export const DraftedClaimsSchema = z.object({
  claims: z.array(DraftedClaimSchema),
});

export type DraftedClaim = z.infer<typeof DraftedClaimSchema>;
export type DraftedClaims = z.infer<typeof DraftedClaimsSchema>;
```

- [ ] **Step 4: Tool** — `lib/ai/tools/return-drafted-claims.ts`:
```ts
import "server-only";
import { DraftedClaimsSchema, type DraftedClaims } from "@/lib/ai/schemas/drafter";
import type { Tool, ToolResult } from "./types";

// Forced via tool_choice in the drafter; execute() echoes for interface conformance.
export const returnDraftedClaimsTool: Tool<DraftedClaims> = {
  name: "return_drafted_claims",
  description:
    "Return 2-7 candidate claims extracted from the user's reasoning. Each claim is a single falsifiable " +
    "statement in the user's own words, a category, and the verbatim source excerpt it was drawn from. " +
    "Do not introduce reasoning the user did not provide; do not assess whether claims are true.",
  inputSchema: DraftedClaimsSchema,
  async execute(input: DraftedClaims): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
```

- [ ] **Step 5: Verify pass + typecheck** — `npx vitest run lib/ai/schemas/drafter.test.ts && npm run typecheck` → PASS / clean.

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/ai/schemas/drafter.ts lib/ai/schemas/drafter.test.ts lib/ai/tools/return-drafted-claims.ts
git commit -m "feat: add drafted-claims schema and return_drafted_claims tool"
```

---

## Task 2: Drafter prompt

**Files:** Create `lib/ai/prompts/drafter.ts`.

- [ ] **Step 1: Implement** — `lib/ai/prompts/drafter.ts`:
```ts
export const DRAFTER_PROMPT_VERSION = "drafter-v1";

export const systemPrompt = `You structure an investor's own reasoning into claims. Given a ticker, a position direction, and a free-text paragraph, extract the distinct claims the investor is making — each a single, falsifiable statement an analyst could later seek evidence for.

Rules:
- Extract 2 to 7 claims. Use the investor's OWN words and meaning — rephrase only enough to make each a standalone, falsifiable statement.
- Do NOT introduce reasoning, facts, or claims the investor did not express. Do NOT judge whether any claim is true. You are structuring, not advising.
- Assign each claim the single best-fitting category.
- Set sourceExcerpt to the verbatim substring of the paragraph the claim is drawn from (copy it exactly; use "" only if no single span fits).
- If the paragraph is too vague to yield even two distinct claims, return fewer (or none) rather than inventing them.
- You MUST respond by calling the return_drafted_claims tool.`;

export function buildDraftingTask(
  ticker: string,
  positionDirection: "long" | "short",
  reasoning: string,
): string {
  return [
    `TICKER: ${ticker}`,
    `POSITION: ${positionDirection}`,
    "",
    "INVESTOR'S REASONING:",
    reasoning,
  ].join("\n");
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/ai/prompts/drafter.ts
git commit -m "feat: add drafter prompt and task builder"
```

---

## Task 3: Drafter agent (TDD)

**Files:** Create `lib/ai/agents/drafter.ts`, `lib/ai/agents/drafter.test.ts`.

- [ ] **Step 1: Failing test** — `lib/ai/agents/drafter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { draftClaims } from "./drafter";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: async () =>
      ({ content: [{ type: "tool_use", name: "return_drafted_claims", id: "d1", input }], usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Anthropic.Message,
  };
}

const input = { ticker: "NVDA", positionDirection: "long" as const, reasoning: "Data center demand keeps growing and margins are strong." };

describe("draftClaims", () => {
  it("returns the validated claims from the tool call", async () => {
    const client = clientReturning({ claims: [{ statement: "Data-center demand keeps growing", category: "financial_performance", sourceExcerpt: "Data center demand keeps growing" }] });
    const res = await draftClaims(input, { client });
    expect(res.claims).toHaveLength(1);
    expect(res.claims[0].category).toBe("financial_performance");
  });
  it("returns empty claims when the tool output is malformed", async () => {
    const client = clientReturning({ claims: [{ statement: "x", category: "not-a-category", sourceExcerpt: "" }] });
    const res = await draftClaims(input, { client });
    expect(res.claims).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/ai/agents/drafter.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/ai/agents/drafter.ts`:
```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnthropicLike } from "@/lib/ai/client";
import { DraftedClaimsSchema, type DraftedClaims } from "@/lib/ai/schemas/drafter";
import { returnDraftedClaimsTool } from "@/lib/ai/tools/return-drafted-claims";
import { systemPrompt, buildDraftingTask } from "@/lib/ai/prompts/drafter";

const tools = [
  {
    name: returnDraftedClaimsTool.name,
    description: returnDraftedClaimsTool.description,
    input_schema: z.toJSONSchema(returnDraftedClaimsTool.inputSchema) as unknown,
  },
];

export async function draftClaims(
  input: { ticker: string; positionDirection: "long" | "short"; reasoning: string },
  deps: { client: AnthropicLike },
): Promise<DraftedClaims> {
  // Default model (CURRENT_MODEL = Opus 4.8); forced tool + thinking off, like the evaluator.
  const response = await deps.client.createMessage({
    system: systemPrompt,
    tools,
    messages: [{ role: "user", content: buildDraftingTask(input.ticker, input.positionDirection, input.reasoning) }],
    toolChoice: { type: "tool", name: "return_drafted_claims" },
    thinking: false,
    maxTokens: 2048,
  });
  const toolUse = (response.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "return_drafted_claims",
  );
  const parsed = DraftedClaimsSchema.safeParse(toolUse?.input);
  return parsed.success ? parsed.data : { claims: [] };
}
```

- [ ] **Step 4: Verify pass + typecheck** — `npx vitest run lib/ai/agents/drafter.test.ts && npm run typecheck` → PASS / clean.
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/ai/agents/drafter.ts lib/ai/agents/drafter.test.ts
git commit -m "feat: add one-shot drafter agent"
```

---

## Task 4: Drafter fixtures

**Files:** Create `lib/ai/drafter-fixtures.ts`, `__fixtures__/agent-runs/nvda-happy-path/drafter.json`.

- [ ] **Step 1: Reader** — `lib/ai/drafter-fixtures.ts`:
```ts
import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline drafter replay: one recorded return_drafted_claims message per scenario.
// Input-independent — the dev flow gets canned claims without spending tokens.
export class DrafterFixtureReader {
  private item: unknown;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "drafter.json");
    if (!existsSync(path)) throw new Error(`Drafter fixture not found: ${scenario} (${path})`);
    this.item = JSON.parse(readFileSync(path, "utf8"));
  }
  next(): unknown {
    return this.item;
  }
}
```

- [ ] **Step 2: Fixture data** — `__fixtures__/agent-runs/nvda-happy-path/drafter.json`:
```json
{ "content": [{ "type": "tool_use", "id": "d1", "name": "return_drafted_claims", "input": { "claims": [
  { "statement": "Data-center revenue continues to grow at a high rate year over year", "category": "financial_performance", "sourceExcerpt": "data center revenue keeps climbing" },
  { "statement": "NVIDIA retains its lead over competing AI accelerators", "category": "competitive_position", "sourceExcerpt": "no one is close on the software stack" },
  { "statement": "Hyperscaler capex on AI infrastructure stays elevated", "category": "macro_environment", "sourceExcerpt": "the big clouds keep spending" }
] } }], "usage": { "input_tokens": 180, "output_tokens": 90 } }
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/ai/drafter-fixtures.ts __fixtures__/agent-runs/nvda-happy-path/drafter.json
git commit -m "feat: add offline drafter fixture reader and data"
```

---

## Task 5: `DraftRequestSchema` + `draftClaimsFromParagraph` Server Action

**Files:** Modify `schemas/thesis.ts`, `app/(app)/theses/agent-actions.ts`.

- [ ] **Step 1: Request schema** — append to `schemas/thesis.ts` (it already exports `TickerSchema`, `POSITION_DIRECTIONS`):
```ts
export const DraftRequestSchema = z.object({
  ticker: TickerSchema,
  positionDirection: z.enum(POSITION_DIRECTIONS),
  reasoning: z
    .string()
    .trim()
    .min(30, "Add a bit more detail — at least 30 characters")
    .max(2000, "Keep your reasoning under 2000 characters"),
});
export type DraftRequestInput = z.infer<typeof DraftRequestSchema>;
```

- [ ] **Step 2: Action** — append to `app/(app)/theses/agent-actions.ts`:
```ts
import type { Anthropic } from "@anthropic-ai/sdk";
import { DraftRequestSchema } from "@/schemas/thesis";
import { draftClaims } from "@/lib/ai/agents/drafter";
import { DrafterFixtureReader } from "@/lib/ai/drafter-fixtures";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { serverEnv } from "@/lib/env.server";
import type { DraftedClaim } from "@/lib/ai/schemas/drafter";

// Draft (not save) candidate claims from a paragraph. The wizard reviews/edits
// the result and saves through createThesis.
export async function draftClaimsFromParagraph(
  input: { ticker: string; positionDirection: "long" | "short"; reasoning: string },
): Promise<ActionResult<{ claims: DraftedClaim[] }>> {
  await requireUserId();
  const parsed = DraftRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const useFixtures = serverEnv.USE_AI_FIXTURES;
  const client: AnthropicLike = useFixtures
    ? { createMessage: async () => new DrafterFixtureReader("nvda-happy-path").next() as Anthropic.Message }
    : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
  try {
    const { claims } = await draftClaims(parsed.data, { client });
    return { ok: true, data: { claims } };
  } catch {
    return { ok: false, error: "Drafting failed — please try again." };
  }
}
```
> `requireUserId`, `inngest`, and `ActionResult` are already imported in this file (from the 5a/earlier work); add only the new imports above and avoid duplicates. `ActionResult<T>` is `{ ok: true; data: T } | { ok: false; error: string }`.

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add schemas/thesis.ts app/\(app\)/theses/agent-actions.ts
git commit -m "feat: add draftClaimsFromParagraph server action"
```

---

## Task 6: `ParagraphDrafter` component

**Files:** Create `components/theses/ParagraphDrafter.tsx`.

> **Engage the frontend-design skill** — the drafting moment should feel considered: a clean textarea, a clear "Draft claims" CTA, drafted cards that animate in (Motion) with the source excerpt as muted context and a per-claim Add control.

- [ ] **Step 1: Implement** — `components/theses/ParagraphDrafter.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { draftClaimsFromParagraph } from "@/app/(app)/theses/agent-actions";
import type { DraftedClaim } from "@/lib/ai/schemas/drafter";
import type { ClaimInput, PositionDirection } from "@/schemas/thesis";

export function ParagraphDrafter({
  ticker,
  positionDirection,
  onAdd,
  canAdd,
}: {
  ticker: string;
  positionDirection: PositionDirection;
  onAdd: (claim: ClaimInput) => void;
  canAdd: boolean;
}) {
  const [reasoning, setReasoning] = useState("");
  const [drafted, setDrafted] = useState<DraftedClaim[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  function draft() {
    startTransition(async () => {
      const res = await draftClaimsFromParagraph({ ticker, positionDirection, reasoning });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDrafted(res.data.claims);
      setAdded(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={reasoning}
        onChange={(e) => setReasoning(e.target.value)}
        rows={5}
        maxLength={2000}
        placeholder="Paste or write your reasoning. e.g. 'Data-center demand keeps climbing, no one is close on the software stack, and the big clouds keep spending…'"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">{reasoning.trim().length}/2000 · at least 30 characters</p>
        <Button size="sm" disabled={pending || reasoning.trim().length < 30} onClick={draft}>
          {pending ? "Drafting…" : "Draft claims"}
        </Button>
      </div>

      {drafted && drafted.length === 0 && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
          Couldn&apos;t draft claims from that — add more detail, or write them manually.
        </p>
      )}

      {drafted && drafted.length > 0 && (
        <div className="space-y-2">
          {drafted.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.05 }}
              className="rounded-xl border border-zinc-100 bg-white px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CategoryBadge category={c.category} />
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
                  {c.sourceExcerpt && (
                    <p className="mt-1 text-[11px] italic text-zinc-400">from: “{c.sourceExcerpt}”</p>
                  )}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={added.has(i) || !canAdd}
                  onClick={() => {
                    onAdd({ statement: c.statement, category: c.category });
                    setAdded((prev) => new Set(prev).add(i));
                  }}
                >
                  {added.has(i) ? "Added" : "Add"}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```
> `Textarea` (`components/ui/textarea.tsx`) and the Button `xs`/`outline` variants exist (verify in `components/ui/button.tsx`; the segmented direction control + `ClaimForm` already use these patterns). The added claim is a plain `ClaimInput` (statement + category) — `sourceExcerpt` is review-only and not persisted.

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/theses/ParagraphDrafter.tsx
git commit -m "feat: add ParagraphDrafter review component"
```

---

## Task 7: Tabbed claims step in the wizard

**Files:** Modify `components/theses/NewThesisWizard.tsx`.

Add a segmented Manual/From-paragraph control to step 2 (above the input area), and render `ParagraphDrafter` in paragraph mode. The selected-claims list and the save path are unchanged.

> **Engage the frontend-design skill** — the segmented control should match the existing direction toggle (`inline-flex … rounded-lg border`); the claims list stays the primary content.

- [ ] **Step 1: Add the import + tab state** — in `components/theses/NewThesisWizard.tsx`:
  - Add import: `import { ParagraphDrafter } from "@/components/theses/ParagraphDrafter";`
  - Near the other `useState`s add: `const [claimMode, setClaimMode] = useState<"manual" | "paragraph">("manual");`

- [ ] **Step 2: Render the tabs + the two input modes** — in the step-2 block, replace the existing input area (the `claims.length < MAX_CLAIMS ? <ClaimForm .../> : <p>…</p>` section) with:
```tsx
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 text-sm">
            {(["manual", "paragraph"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setClaimMode(m)}
                className={`px-3.5 py-1.5 font-medium ${
                  claimMode === m ? "bg-primary text-primary-foreground" : "text-zinc-500"
                }`}
              >
                {m === "manual" ? "Write manually" : "Start from a paragraph"}
              </button>
            ))}
          </div>

          {claims.length >= MAX_CLAIMS ? (
            <p className="text-xs text-zinc-400">Maximum of {MAX_CLAIMS} claims reached.</p>
          ) : claimMode === "manual" ? (
            <ClaimForm
              key={claims.length}
              submitLabel="Add claim"
              onSubmit={(input) => setClaims((prev) => [...prev, input])}
            />
          ) : (
            <ParagraphDrafter
              ticker={ticker}
              positionDirection={direction}
              canAdd={claims.length < MAX_CLAIMS}
              onAdd={(claim) => setClaims((prev) => (prev.length < MAX_CLAIMS ? [...prev, claim] : prev))}
            />
          )}
```
(The selected-claims list above this block — the `claims.map(...)` cards with Remove — is unchanged and stays the running tally as the user adds from either mode.)

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Manual check** — `/theses/new`: step 1 → step 2; toggle "Start from a paragraph"; with `USE_AI_FIXTURES=1` and the dev server, type ≥30 chars, "Draft claims" → 3 cards animate in with excerpts; "Add" pushes into the claims list and disables; trim to ≤5 and save works.
- [ ] **Step 5: Commit** (after approval)
```bash
git add components/theses/NewThesisWizard.tsx
git commit -m "feat: add paragraph-drafting tab to the new-thesis flow"
```

---

## Task 8: Gates + design pass + DESIGN.md

**Files:** Modify any 6a surface as the pass dictates; `docs/DESIGN.md`.

- [ ] **Step 1: Full gates** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint` → all pass / clean.
- [ ] **Step 2: Design pass** — re-engage the frontend-design skill on the step-2 tabs + `ParagraphDrafter` (textarea, CTA, animated drafted cards, excerpt styling). Confirm it reads as a considered moment, not a form dump. Tighten only what clearly needs it (no broad restyle).
- [ ] **Step 3: Record in `docs/DESIGN.md`** — append a "Paragraph drafting (Phase 6a)" screen-notes block: the segmented Manual/From-paragraph control on the claims step; the `ParagraphDrafter` review pattern (textarea → drafted cards animate in with muted source excerpt + per-claim Add, select-to-add into the shared claims list); the empty/vague-paragraph inline message. Add dated decisions-log entries (2026-06-15): drafter = third one-shot agent (Opus, fixture-backed); review-and-add UX (not blind-merge) to keep the excerpt visible and the user in control.
- [ ] **Step 4: Commit** (after approval)
```bash
git add docs/DESIGN.md <any-touched-component-files>
git commit -m "docs: record Phase 6a paragraph-drafting design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Drafter agent (one-shot, forced tool, Opus, malformed→empty) → Tasks 1–3. ✓
- Schema `{ claims: [{ statement, category, sourceExcerpt }] }`, lenient lengths → Task 1. ✓
- Prompt (extract 2–7 in user's words, no added reasoning, no validity judgment, source excerpt) → Task 2. ✓
- Fixtures gated by `USE_AI_FIXTURES` → Task 4. ✓
- `DraftRequestSchema` + `draftClaimsFromParagraph` (validates, doesn't save, fixture/real client, ActionResult) → Task 5. ✓
- Tabbed claims step + `ParagraphDrafter` review-and-add into shared `claims`, save path unchanged → Tasks 6–7. ✓
- Error/empty states (short reasoning, API error toast, 0-claims inline message) → Tasks 5–6. ✓
- Testing: schema, agent, (fixture replay exercised via the agent test shape) → Tasks 1, 3. ✓
- Out of scope (streaming/highlight, ticker-only v2) correctly excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. Two verify-in-context notes (Button `xs`/`outline` variants, `Textarea` import) have concrete fallbacks and match existing usage.

**Type consistency:** `DraftedClaim`/`DraftedClaims` defined Task 1, consumed Tasks 3 (agent), 5 (action return), 6 (component prop). `draftClaims(input, { client })` signature consistent Tasks 3/5. `DraftRequestSchema`/`DraftRequestInput` Task 5. `ParagraphDrafter` props (`ticker`/`positionDirection`/`onAdd`/`canAdd`) defined Task 6, used Task 7. `onAdd` receives a `ClaimInput` (statement+category), matching the wizard's `claims: ClaimInput[]`. `CLAIM_CATEGORIES` reused from `schemas/thesis.ts` (client-safe).
```
