# Phase 4 — Evaluator & Thesis Health — Design Spec

**Date:** 2026-06-13
**Status:** Approved for planning
**Goal:** Every piece of evidence the researcher gathers is evaluated against every claim of its thesis. The dashboard shows confidence-weighted, time-decayed health per claim and per thesis, and a chart of how thesis health has evolved over time.

**Prerequisite:** Phase 3 (researcher engine + agent run trace UI) — merged.

---

## 1. Scope & sub-phase split

Phase 4 is delivered in two sub-phases, mirroring the Phase 3 (3a/3b) rhythm. This spec covers the whole phase; `writing-plans` produces the **4a** plan first.

- **Phase 4a — Evaluation engine (no UI):** schema migration, evaluator agent + prompt + schema, `lib/health/` calculation, `evaluate-run` Inngest function, repositories, fixtures, offline end-to-end test.
- **Phase 4b — Health UI:** reusable health bar, claim health on `ClaimList`, thesis-level health on the list view, evaluator verdicts on the trace evidence cards, Recharts time-series chart, design pass + `DESIGN.md` updates.

### Out of scope (YAGNI for v1)

- Per-claim chart drill-down UI (per-claim scores are *stored* in the snapshot JSONB; the UI for them can come later).
- A manual "re-evaluate this pair / this thesis" button.
- Evidence deduplication / embedding-similarity lookup.
- Distinguishing a *failed* evaluation from a *genuine* neutral (both record neutral/0 in v1).
- The drafter agent (Phase 6).

---

## 2. Data model

Drizzle migration adding one enum and two tables. The new enum gets a client-safe tuple in `schemas/` plus a drift-guard test, matching the Phase 3 enum pattern (`schemas/agent.ts` ↔ `lib/db/schema.ts`).

### Enum: `evidence_impact`

`['strengthens', 'neutral', 'weakens']` — `pgEnum` in `lib/db/schema.ts`; client-safe tuple `EVIDENCE_IMPACTS` in `schemas/evidence.ts` with a drift-guard test asserting the two stay in sync.

### Table: `claim_evidence_links`

The join table holding the evaluator's verdict for one (claim, evidence) pair.

```ts
{
  id: uuid (pk, defaultRandom)
  claimId: uuid (fk → claims.id, on delete cascade)        // indexed
  evidenceId: uuid (fk → evidence.id, on delete cascade)
  impact: evidence_impact (notNull)
  confidence: numeric(3,2) (notNull)                        // 0.00 .. 1.00
  reasoning: text (notNull)                                 // evaluator's explanation
  evaluatorPromptVersion: text (notNull)                    // cache invalidation
  createdAt: timestamptz (notNull, default now)
  updatedAt: timestamptz (notNull, default now, $onUpdate)
}
```

- **Unique constraint** on `(claimId, evidenceId)` — one verdict per pair.
- **Index** on `claimId` alone for the "show this claim's evidence" query.
- Re-evaluating a pair under a newer `evaluatorPromptVersion` **updates** the existing row (bumping `updatedAt`), so changing the prompt naturally invalidates stale verdicts.

### Table: `thesis_health_snapshots`

One row per completed-and-evaluated run, capturing thesis health at that point in time. Chosen over on-the-fly historical recomputation because health is time-decayed: reconstructing "health as of date X" on the fly is error-prone and grows slower over time, whereas a snapshot is cheap (one row/run), accurate at the point of capture, and the per-claim JSONB enables per-claim trend lines later without a schema change.

```ts
{
  id: uuid (pk, defaultRandom)
  thesisId: uuid (fk → theses.id, on delete cascade)        // indexed with recordedAt
  agentRunId: uuid (fk → agent_runs.id, on delete cascade)  // unique — one snapshot per run
  recordedAt: timestamptz (notNull, default now)
  overallScore: numeric(3,2) (notNull)                      // -1.00 .. 1.00
  claimScores: jsonb (notNull)                              // [{ claimId, ordinal, score }]
  createdAt: timestamptz (notNull, default now)
  updatedAt: timestamptz (notNull, default now, $onUpdate)
}
```

- **Unique** on `agentRunId` (upsert target — re-delivery of the trigger event updates the same snapshot).
- **Index** on `(thesisId, recordedAt)` for the chart query.

### Existing columns we begin using

`claims.current_health_score numeric(3,2) default 0` and `claims.current_health_updated_at timestamptz` already exist from the Phase 1 scaffold. Phase 4 starts writing them. `theses` has **no** health column by design — thesis-level health is the mean of its claims' `current_health_score` (claims number 2–5, so aggregating on read is cheap).

---

## 3. Evaluator agent

`lib/ai/agents/evaluator.ts` exports `evaluate(claim, evidence): Promise<EvaluationResult>`.

- **One-shot, no loop.** A single Messages API call with `tools: [returnEvaluationTool]` and `tool_choice: { type: 'tool', name: 'return_evaluation' }` to force structured output. No extended thinking (bounded classification; the `reasoning` field carries the "why").
- **Model:** `claude-sonnet-4-6`. Precise judgment on a focused question at acceptable matrix-scale cost; caching + dev fixtures keep spend down.
- **Output schema** (`lib/ai/schemas/` Zod): `EvaluationSchema = { impact: EvidenceImpact, confidence: number().min(0).max(1), reasoning: string().min(1) }`. Validated on the way out (never trust the model response without Zod).
- **Prompt** in `lib/ai/prompts/evaluator.ts`, exporting `{ systemPrompt, taskTemplate, promptVersion }`. `promptVersion = 'eval-v1'`. Tone is **conservative**: default to `neutral` with low confidence unless the evidence clearly bears on the claim; the agent judges only the evidence in front of it (it does not search).
- **Fixtures:** `USE_AI_FIXTURES=1` short-circuits the Anthropic call with recorded evaluations keyed by scenario (mirrors the researcher fixture mechanism). Demo-thesis evaluations are recorded so dev/offline never spends tokens.

---

## 4. Health calculation — `lib/health/`

Pure, deterministic, fully unit-tested. AI is for judgment; health math is code so it is consistent, debuggable, fast, and free.

`lib/health/score.ts`:

```ts
export const HALF_LIFE_DAYS = 90;

// 0.5 ** (ageMs / halfLifeMs)
export function decayWeight(ageMs: number, halfLifeMs?: number): number;

// strengthens → +1, neutral → 0, weakens → -1
export function impactValue(impact: EvidenceImpact): number;

// Σ(impactValue·confidence·decay) / Σ(confidence·decay); 0 when no links. Bounded [-1, 1].
export function claimHealth(
  links: { impact: EvidenceImpact; confidence: number; createdAt: Date }[],
  now: Date,
): number;

// simple mean of claim scores; 0 when empty
export function thesisHealth(claimScores: number[]): number;
```

Notes:
- Weighted-average formula (chosen over a saturating `tanh` sum) for explainability — it is the more defensible "show your work" number to narrate. Known quirk: a single low-confidence `strengthens` reads as fully +1 because volume is not rewarded; accepted for v1.
- Neutral evidence (impact 0) contributes to the denominator, correctly pulling a claim's score toward 0.
- Scores are clamped/bounded to [-1, 1] by construction.

---

## 5. Trigger & Inngest flow

The evaluator runs as a **separate Inngest function** from the researcher (separation of concerns; a model judging its own gathered evidence is biased).

1. **Emit:** at the end of a successful `run-agent` run that collected evidence, send `inngest.send({ name: 'agent-run.completed', data: { agentRunId, thesisId, userId, scenario } })`. `scenario` is forwarded so fixtures propagate to evaluation.
2. **`lib/inngest/functions/evaluate-run.ts`** is triggered by `agent-run.completed`:
   - **Step `load`:** load the run, the thesis with its claims, and the evidence for the run.
   - **Step `evaluate-matrix`** (a single step, not one per pair): iterate every (claim, evidence) pair; for each, `findCachedLink(claimId, evidenceId, promptVersion)` — if a current-version link exists, skip; otherwise call the evaluator and `upsertEvaluation`. Writing each link as we go makes step retries cheap and idempotent (already-written pairs are cached), and one step keeps the Inngest step count low.
   - **Step `recompute-health`:** for each claim, recompute `claimHealth` from **all** of that claim's links (full history, decayed to now), compute `thesisHealth`, then a `db.batch()` of: claim `current_health_score` / `current_health_updated_at` updates + one `upsertSnapshot` keyed on `agentRunId`. (neon-http has no interactive transactions; `db.batch()` is all-or-nothing.)

Idempotency: re-delivery of `agent-run.completed` re-runs cheaply — cached links skip, health recomputes to the same value, the snapshot upserts in place.

---

## 6. Repositories

All DB access stays behind repositories.

- `lib/db/repositories/claim-evidence-links.ts`
  - `upsertEvaluation({ claimId, evidenceId, impact, confidence, reasoning, evaluatorPromptVersion })` — insert or update on the unique `(claimId, evidenceId)`.
  - `findCachedLink(claimId, evidenceId, promptVersion)` — returns the link only if its `evaluatorPromptVersion` matches.
  - `listLinksForClaim(claimId)` — for claim health recompute and the claim's evidence list.
  - `listLinksForEvidenceIds(evidenceIds)` — for the trace view (verdicts per evidence).
- `lib/db/repositories/health-snapshots.ts`
  - `upsertSnapshot({ thesisId, agentRunId, recordedAt, overallScore, claimScores })` — upsert on `agentRunId`.
  - `listSnapshotsForThesis(thesisId)` — ordered by `recordedAt`, for the chart.
- Extend existing repos:
  - claims repo: a batch-friendly helper that produces the claim health-update statements for `db.batch()`.
  - theses list repo: add `avg(claims.current_health_score)` per thesis to the existing list query so the list view can show thesis-level health without N+1.

---

## 7. UI (Phase 4b)

Follows the established design language (zinc neutrals, deep-blue `#1E3A5F` accent, green `#1F7A4D` / red `#C0492F` for positive/negative). Engage the frontend-design skill on each surface; run a design pass after.

- **`HealthBar`** (reusable) — a −1..1 indicator, color-coded (green positive, red negative, zinc near-neutral) with the numeric value. Used on claim cards and thesis cards. **Unanalyzed state:** when a claim/thesis has not been analyzed yet (`current_health_updated_at IS NULL` / no snapshot), the bar renders the dashed "Not analyzed" track instead of a fabricated `0.00` — matching `DESIGN.md` and the existing list-row placeholder. The component takes an explicit `analyzed`/`updatedAt`-derived flag, never inferring "unanalyzed" from a `0` score (0 is a legitimate neutral result post-analysis).
- **`ClaimList`** — a health bar per claim from `currentHealthScore`, gated on `currentHealthUpdatedAt` for the analyzed/unanalyzed distinction.
- **Thesis list view** (`theses/page.tsx`) — a thesis-level health badge per card. `listThesesByUser` is extended to return both `avg(claims.current_health_score)` **and** an analyzed signal (`max(claims.current_health_updated_at)`); the row shows a real bar only when analyzed, else keeps "Not analyzed yet".
- **Trace `EvidenceCard`** — upgrade the existing zero-based-safe "claim N" tags to show the evaluator's verdict per tagged claim: impact (color-coded), confidence, and expandable reasoning. The researcher's `claimIndices` are **ordinals**, while links are keyed by `claimId`; the trace page maps ordinal → claim → link using the run's thesis claims (ordered by `ordinal`). The page (`runs/[runId]/page.tsx`) loads links for the run's evidence via `listLinksForEvidenceIds` and passes them down.
- **`HealthChart`** (`"use client"`, Recharts — pre-approved in CLAUDE.md) on the thesis detail page — an overall-score line over `recordedAt` from `listSnapshotsForThesis`. Per-claim lines (from the JSONB) are a stretch within 4b. Empty state: when fewer than 2 snapshots, show a "Run analysis over time to see the trend" placeholder rather than a one-point chart.

---

## 8. Error handling

- **Evaluator API error:** let the Inngest step retry (no manual retry loop inside the step).
- **Malformed / Zod-invalid evaluator output** after retries: record a **neutral, confidence-0** link whose `reasoning` notes the failure. This keeps the matrix complete, contributes 0 to health, and avoids an infinite retry. (v1 does not add a separate "failed" flag — neutral/0 is self-documenting; a later prompt-version re-run overwrites it.)
- **No new Server Actions** — evaluation is entirely background. Detail/list pages read via Server Components.
- **Empty states:** unanalyzed claims/theses (`current_health_updated_at IS NULL` / no snapshot) show the dashed "Not analyzed" state, **never** a fabricated `0.00` bar (per `DESIGN.md`); a `0.00` bar is shown only as a genuine post-analysis neutral result. Theses with fewer than 2 snapshots show the chart placeholder; the matrix step is a no-op when a run collected no evidence.

---

## 9. Testing (TDD)

- `lib/health/score.test.ts` — `decayWeight` (half-life behavior), `claimHealth` (weighted average, neutral pulls toward 0, no-links → 0, bounds), `thesisHealth` (mean, empty → 0).
- `EvaluationSchema` validation tests (accepts valid, rejects out-of-range confidence / bad impact).
- `evidence_impact` enum drift-guard test.
- Fixture-based evaluator test (no real API): given a recorded scenario, `evaluate` returns the expected structured verdict.
- Extend the offline fixtured harness (the Phase 3a `scripts/run-agent-fixture.ts` equivalent) so a fixtured run also produces `claim_evidence_links` + a `thesis_health_snapshots` row, asserted end-to-end.
- UI tests deferred per CLAUDE.md.

---

## 10. Cost & free-tier awareness

- **Anthropic:** evaluator on Sonnet 4.6; a run's matrix (≈ evidence × claims, e.g. 8 × 4 = 32 calls, small input + tiny output) is roughly $0.10–0.15, controlled by `(claimId, evidenceId, promptVersion)` caching and mandatory dev fixtures.
- **Inngest:** the matrix is one step, so evaluation adds ~2 steps per run — comfortably within the 50k/month budget.
- **Neon:** `claim_evidence_links` rows = evidence × claims per run (cascade-deleted with the thesis); `thesis_health_snapshots` is one row per run. Negligible against the 0.5 GB limit.

---

## 11. File map

```
schemas/evidence.ts                              # EVIDENCE_IMPACTS tuple (+ drift test)
lib/db/schema.ts                                 # evidence_impact enum, claim_evidence_links, thesis_health_snapshots
lib/db/repositories/claim-evidence-links.ts
lib/db/repositories/health-snapshots.ts
lib/ai/agents/evaluator.ts
lib/ai/prompts/evaluator.ts                      # systemPrompt, taskTemplate, promptVersion='eval-v1'
lib/ai/schemas/                                  # EvaluationSchema, return_evaluation tool
lib/health/score.ts                              # decayWeight, impactValue, claimHealth, thesisHealth
lib/inngest/functions/evaluate-run.ts
lib/inngest/client.ts                            # register agent-run.completed event type (if typed)
components/agent/HealthBar.tsx                    # 4b
components/theses/HealthChart.tsx                 # 4b (Recharts, "use client")
components/agent/trace/EvidenceCard.tsx           # 4b — show verdicts
components/theses/ClaimList.tsx                   # 4b — health bars
app/(app)/theses/page.tsx                         # 4b — thesis-level health
app/(app)/theses/[thesisId]/page.tsx              # 4b — HealthChart
app/(app)/theses/[thesisId]/runs/[runId]/page.tsx # 4b — load links for evidence
```
