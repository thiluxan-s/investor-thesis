# Phase 7 — Challenge the Thesis — Design Spec

**Date:** 2026-08-17
**Status:** Draft — awaiting review
**Goal:** The agent can be pointed *against* a thesis, not only at it. A user triggers a "challenge" run: the same hand-written loop searches for disconfirming evidence, the unchanged evaluator scores it, and a new one-shot agent writes a short brief arguing the case against the thesis. A new per-claim view makes every health score explainable — which evidence moved it, by how much, and whether it came from research or from a challenge.

**Prerequisite:** Phases 1–6 — shipped and merged (`main` @ `a3b8c5f`).

---

## 1. Motivation

Two gaps in the shipped product, both visible from the docs:

1. **The health score is unexplainable in the UI.** `claim_evidence_links` stores an `impact`, a `confidence`, and the evaluator's `reasoning` for every (claim, evidence) pair, and nothing in the app reads any of it except the score rollup. Evidence is only reachable inside an individual run's trace, grouped by run. `PRD.md` §"v1 scope" item 5 promises an evidence timeline "with source link, extracted text, agent's reasoning, and impact on which claim" — that is half-built. Today a claim renders a bar with no way to ask *why*.

2. **The agent never looks for disconfirming evidence.** The PRD's problem statement is that investors "hold on too long — thesis quietly broke months ago", yet nothing in the loop is structurally biased toward finding that. A researcher handed a thesis and its claims will, in practice, surface confirming material. `ARCHITECTURE.md` §"Extension seams" already names "devil's advocate that explicitly looks for counter-evidence" as a designed extension point.

The two are one feature: the challenge run is the engine, the claim drill-down is where its output lands.

### Product boundary

This does **not** cross the PRD's robo-advisor non-goal. The brief summarises counter-evidence the tool actually found and the evaluator actually scored. It never recommends an action, never says "sell", and never assigns a probability to the thesis being wrong. Copy discipline is part of the spec (§8).

---

## 2. Scope & sub-phase split

Delivered in two sub-phases, matching the 3a/3b and 4a/4b rhythm. This spec covers the whole phase; `writing-plans` produces the **7a** plan first.

- **Phase 7a — Challenge engine (no UI):** `agent_run_mode` enum + `agent_runs.mode`, `challenge_briefs` table, mode-aware researcher prompts, the challenger agent, the health-breakdown function, repositories, Inngest wiring, fixtures, offline end-to-end test.
- **Phase 7b — Surfaces:** challenge trigger on the thesis header, brief rendering on the run trace, the per-claim drill-down route, `/demo` parity, design pass + `DESIGN.md` updates.

### Out of scope (YAGNI)

- Challenge runs on the weekly cron. The cron keeps emitting research runs only; challenge stays user-triggered (decided during brainstorming — cost control plus a clearer trace story).
- A "re-run the brief" button. The brief regenerates on the next challenge run.
- Per-claim challenge runs (targeting one claim). The run challenges the whole thesis.
- Embedding/similarity dedup of counter-evidence. `evidence.extracted_text_embedding` stays unused; §12 covers the doc correction.
- Editing or dismissing a brief.
- Notifying the user when a challenge run breaks a thesis (that's the separate health-alerts idea).

---

## 3. Data model

Two additive changes. One Drizzle migration. No existing column changes shape.

### Enum: `agent_run_mode`

`['research', 'challenge']` — `pgEnum` in `lib/db/schema.ts`, client-safe tuple `AGENT_RUN_MODES` in `schemas/agent.ts`, drift-guard assertion added to the existing `lib/db/agent-enum-sync.test.ts`.

`mode` is **orthogonal to `trigger`**. `trigger` records *who started the run* (manual / scheduled); `mode` records *what the run was looking for*. A scheduled challenge run is representable even though nothing emits one in this phase.

### Column: `agent_runs.mode`

```ts
mode: agent_run_mode("mode").notNull().default("research")
```

The default backfills every existing row to `research`, which is accurate — every run to date was a research run. No data migration needed.

### Table: `challenge_briefs`

One row per challenge run that had something to argue. 1:1 with the run.

```ts
{
  id: uuid (pk, defaultRandom)
  agentRunId: uuid (fk → agent_runs.id, on delete cascade)  // UNIQUE — one brief per run
  thesisId: uuid (fk → theses.id, on delete cascade)        // indexed with createdAt
  headline: text (notNull)                                  // one line, ≤ ~90 chars
  summary: text (notNull)                                   // 2-4 sentences
  points: jsonb (notNull)                                   // [{ claimId, claimOrdinal, argument, evidenceIds: string[] }]
  promptVersion: text (notNull)                             // 'challenge-v1'
  createdAt: timestamptz (notNull, default now)
  updatedAt: timestamptz (notNull, default now, $onUpdate)
}
```

- **Unique** on `agentRunId` — the upsert target, so an Inngest step re-delivery rewrites the same row rather than duplicating.
- `thesisId` is denormalised (same call as `thesis_health_snapshots`) so "latest brief for this thesis" is one query with no join.
- `points[].evidenceIds` are resolved UUIDs, not model-supplied indices — see §5 for the index→UUID mapping and its validation.
- Storing `claimId` **and** `claimOrdinal` lets the UI render a stable label without a join while still surviving claim reordering.

### Naming

The internal term is **challenge**, not "bear case". For a `short` thesis the counter-case is *bullish*, so "bear" is wrong half the time. UI copy says "The case against this thesis". This applies to the table, the enum value, the agent file, and every string a user sees.

---

## 4. Challenge mode on the researcher

`lib/ai/agents/researcher.ts` gains a `mode: AgentRunMode` input. **The loop body does not change** — same stop conditions, same per-iteration persistence, same tool registry, same `return_result` contract. Only the system prompt and the task template are selected by mode.

```ts
export async function runResearcher(
  thesis, claims, seenSourceUrls, deps, scenario, mode: AgentRunMode = "research",
): Promise<ResearcherResult>
```

Both modes get the same durability and trace semantics for free, and the diff stays small enough to read in one sitting. Two alternatives were considered and rejected:

- **Extract a shared `runToolLoop` primitive** and make each mode a thin config. Cleaner on paper, but it refactors the single most important file in the repo, and the extra indirection makes the loop *less* readable — the opposite of why it is hand-written. Violates "minimal targeted changes; don't refactor what isn't part of the task."
- **Prompt-only, no first-class mode.** Cheapest, but the trace could not label the run and health could not split by provenance — both required below.

### Prompts

`lib/ai/prompts/researcher.ts` grows a second export pair rather than a new file: this is the same agent in a different mode, and keeping both prompts adjacent makes the contrast legible.

```ts
export const systemPrompt          // unchanged — research mode
export const challengeSystemPrompt
export function buildResearchTask(...)
export function buildChallengeTask(thesis, claims, seenSourceUrls)
```

`challengeSystemPrompt` keeps the researcher's core discipline (gather, don't judge; a separate evaluator decides impact; allow-listed sources only; `return_result` to finish) and redirects the *search*:

- Look for material that would make these claims **less** likely true: competitor wins, margin or pricing pressure, guidance cuts, demand softness, litigation, regulatory action, insider selling, analyst downgrades, execution slips.
- **Invert for position direction.** For a `short` thesis the disconfirming evidence is bullish. The task template states the direction explicitly rather than relying on the model to infer it.
- **Do not manufacture a counter-case.** If the recent record genuinely supports the thesis, return the (possibly empty) evidence found. An empty `return_result` is a valid, correct outcome.
- Same `claim_indices` tagging convention as research mode, so downstream code is untouched.

### Why this doesn't just produce fabricated negativity

An agent told to find counter-evidence will find *something*. Three independent layers hold, and this is the most interesting property in the phase:

1. **The prompt permits a null result.** "The thesis held up" is an explicitly allowed answer, not a failure.
2. **The evaluator is unaware of run mode.** It is not told the evidence came from a challenge run — it scores impact and confidence exactly as it does for research evidence. Weak counter-material lands as `neutral` with low confidence and contributes ≈0 to health. Nothing about challenge mode can inflate a verdict.
3. **The brief may only cite what survived evaluation.** The challenger is fed *scored* links, never the researcher's raw output, so it cannot argue from material the evaluator rejected.

### Seen-sources behaviour

Unchanged: `listRecentSourceUrlsForThesis(thesisId, 90)`. A challenge run skips URLs already collected, which is correct — an already-collected source is already stored, already evaluated, and (per §5) already available to the brief.

---

## 5. The challenger agent

`lib/ai/agents/challenger.ts` exports `writeChallengeBrief(input, deps): Promise<ChallengeBrief>`.

- **One-shot, no loop.** Mechanically identical to the evaluator and drafter: a single Messages API call with `tools: [returnChallengeBriefTool]`, `tool_choice: { type: 'tool', name: 'return_challenge_brief' }`, and `thinking: false` (adaptive thinking is incompatible with forcing a specific tool — see the note in `lib/ai/client.ts`).
- **Model:** `EVALUATOR_MODEL` (`claude-sonnet-4-6`). Bounded synthesis over supplied text; Opus is not warranted.
- **Prompt:** `lib/ai/prompts/challenger.ts` exporting `{ systemPrompt, buildChallengeBriefTask, CHALLENGER_PROMPT_VERSION }` with `CHALLENGER_PROMPT_VERSION = 'challenge-v1'`, stored on each row.
- **Tool + schema:** `lib/ai/tools/return-challenge-brief.ts`, `lib/ai/schemas/challenge-brief.ts`.

```ts
ChallengeBriefSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1),
  points: z.array(z.object({
    claim_index: z.number().int().min(0),        // zero-based into ordinal-ordered claims
    argument: z.string().min(1),
    evidence_indices: z.array(z.number().int().min(0)),  // zero-based into the supplied list
  })).max(5),
});
```

Zero-based indices mirror the researcher's existing `claim_indices` convention rather than asking the model to echo UUIDs (which it gets wrong and which bloats the payload). The agent maps indices back to `claimId` / `evidenceId` before persisting. **Out-of-range indices are dropped, not fatal**: an unresolvable `evidence_indices` entry is discarded, and a point whose `claim_index` is out of range is discarded whole. A brief left with zero points after filtering is treated as "no brief" (§6).

### What the challenger is given

Not this run's raw evidence — **the thesis's standing weakening links**: every `claim_evidence_links` row for the thesis's claims with `impact = 'weakens'`, ordered by weight (`confidence × decayWeight(age)`), capped at the **top 20**.

Two reasons this beats "only what this run found":

- A challenge run skips already-seen URLs, so the single strongest piece of counter-evidence may have been collected weeks ago. Scoping to this run would make the brief argue a weaker case than the tool actually holds.
- It parallels `recompute-health`, which already recomputes from a claim's full link history rather than one run's slice. Same reasoning, same shape.

The brief is still recorded against the run that produced it — a point-in-time artifact, exactly like `thesis_health_snapshots`.

### Task payload

Thesis title, ticker, position direction, horizon; the ordinal-ordered claim list; then the numbered evidence list, each entry carrying its extracted text, source domain, the claim it weakens, the evaluator's confidence, and its age. The prompt instructs: argue only from the numbered evidence, cite indices for every point, stay descriptive, and **make no recommendation about the position**.

---

## 6. Inngest flow

Both changes are additive; no new function and no new event.

### `run-agent.ts`

- Reads `mode` from the event payload (`AgentRunRequested.data.mode?: AgentRunMode`, defaulting to `'research'`) and passes it to `runResearcher`.
- Forwards `mode` on the `agent-run.completed` event so the *evaluate-run function* can decide whether to write a brief. This is the function's routing concern only — the mode is never passed into the evaluator agent's prompt, which stays mode-blind per §4.
- Fixture scenario for a challenge run is `nvda-challenge` (§9).

### `evaluate-run.ts`

Unchanged through `evaluate-matrix` and `recompute-health` — the evaluator stays mode-blind by design (§4). One new **mode-guarded step afterwards**:

```
if (mode === 'challenge') → step.run('write-challenge-brief', …)
```

Placed here, not at the end of `run-agent`, because the brief must only cite evidence the evaluator has already scored. Running it earlier would mean arguing from unscored material.

Implemented as a step inside `evaluate-run` rather than a fourth Inngest function because the digest-batch settling logic (`settleBatch`) already lives here; a separate function would have to re-coordinate batch completion for a marginal gain in file separation. It stays one `step.run`, so the retry story is unchanged.

**Skip condition:** if the thesis has **no** weakening links at all, no API call is made and no row is written. The UI renders an explicit "held up" state (§8) instead of a brief that argues nothing. Same outcome if every point is filtered out by index validation (§5).

**Idempotency:** the step upserts on `agentRunId`, so re-delivery rewrites one row.

---

## 7. Health breakdown

`lib/health/score.ts` gains one pure function. `claimHealth`, `thesisHealth`, `decayWeight`, and `impactValue` are untouched.

```ts
export type HealthBreakdown = {
  overall: number;                                  // identical to claimHealth over all links
  research: { score: number; count: number };
  challenge: { score: number; count: number };
};

export function claimHealthBreakdown(
  links: { impact: EvidenceImpact; confidence: number; createdAt: Date; runMode: AgentRunMode }[],
  now: Date,
): HealthBreakdown;
```

- `overall` is `claimHealth` over **all** links — the stored `claims.current_health_score` keeps its current meaning and `recompute-health` is not touched. This is asserted directly as a unit-test property.
- `research` and `challenge` are `claimHealth` over their own subsets, with the count of links in each.
- **The sub-scores do not average to `overall`** — each is a weighted average over a different denominator. The UI must present them as "what each line of inquiry found", never as components that sum. This is a copy constraint, not just a note (§8).
- Empty subsets return `{ score: 0, count: 0 }` and the UI renders the count-zero case as an absence, never as a neutral `0.00` — consistent with the existing "Not analyzed" convention in `DESIGN.md`.

---

## 8. UI (Phase 7b)

Existing design language: zinc neutrals, accent `#1E3A5F`, health colours `#1F7A4D` / `#A1A1AA` / `#C0492F`. Engage the frontend-design skill per surface; design pass after each; record decisions in `DESIGN.md`.

### Trigger

The thesis header gains a challenge action beside `AnalyzeNowButton`. Secondary weight — this is the deliberate, occasional action, not the default one. Disabled while any run is active (same `activeRun` guard). Confirmation copy names the cost implication in plain language.

`triggerAgentRun(thesisId)` becomes `triggerAgentRun(thesisId, mode)` with the mode Zod-validated server-side and defaulted to `'research'`; `createAgentRun(thesisId, trigger, mode)` gains the third argument. Challenge runs send `scenario: 'nvda-challenge'`.

### Run trace

- `RunHeader` shows a mode badge. Research runs keep today's appearance; challenge runs are visually distinct but **calm** — this is a considered analysis, not an alarm. Reuses the existing restraint precedent (allow-list refusals render as a brick chip, not a red alert).
- For a challenge run, the brief renders **above** the iteration list: headline, summary, then the points. Each point names its claim and cites its evidence.
- **Citations can outlive the run.** Because the brief argues from the thesis's standing weakening links (§5), a cited item may have been collected by an *earlier* run and so has no card in this trace. Resolution: evidence belonging to this run anchors to its card below; evidence from an earlier run renders with its source and an "earlier run" label, linking to the claim drill-down. A brief must never render a dead anchor.
- Challenge run with no brief: an explicit "No counter-evidence found — the thesis held up this run" state. This is a real result, styled as one, not as an empty state.

### Claim drill-down — `app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx`

A dedicated route rather than an inline expansion on the dashboard: it is a Server Component with no client state, it is linkable (the brief's points and the digest email can deep-link into it), and the dashboard stays dense. Ownership is enforced through the existing thesis-scoped repository path, and a claim not belonging to the thesis is a `notFound()`.

Contents:

1. Claim statement, category badge, current health bar.
2. **The split** — research and challenge scores side by side with their link counts, and one line of copy stating plainly that these are two lines of inquiry, not two halves of the overall number. A line of inquiry with no links reads "No challenge runs yet", not `0.00`.
3. **Evidence, ordered by actual weight** (`confidence × decayWeight(age)`) rather than recency — the ordering the score itself uses. Each row: impact chip, confidence, the evaluator's reasoning, extracted text, source link and domain, the originating run (mode-labelled, linking to its trace), and **that item's contribution to the score**. The contribution number is what makes the health bar stop being a magic number.
4. Empty state for an unanalyzed claim, matching the existing convention.

`ClaimList` rows link into this route.

### Demo parity

Not optional — `/demo` is the only path a recruiter walks. The seed gains a challenge run with its brief, and the demo tree gains `app/demo/claims/[claimId]/page.tsx` reusing the same components through `lib/demo/queries.ts` + the `scopeToDemo` guard. Both demo routes stay `force-dynamic` (public DB-reading pages break the Vercel build if statically prerendered).

---

## 9. Fixtures

New scenario directory `__fixtures__/agent-runs/nvda-challenge/`:

```
messages.json         # the challenge loop's model turns
tools.json            # its tool results
evaluations.json      # evaluator verdicts for the counter-evidence
challenge-brief.json  # the challenger's forced-tool-use response
```

`scripts/run-agent-fixture.ts` is extended to take a mode so the scenario can be recorded once against the real API and committed. A `ChallengeBriefFixtureReader` mirrors the existing `EvaluationFixtureReader` / `DrafterFixtureReader` pattern. `USE_AI_FIXTURES=1` remains the dev default; no phase work requires live calls beyond the single recording session.

---

## 10. Error handling

- **Challenger API error:** the Inngest step retries (no manual retry loop inside a step, per convention).
- **Malformed or Zod-invalid brief after retries:** no brief row is written and the run is **not** failed — the counter-evidence and its verdicts are already persisted and already counted in health. The trace shows the "no brief" state. A missing synthesis must never discard successfully gathered evidence.
- **Partially invalid brief:** out-of-range indices are dropped (§5); zero surviving points is treated as no brief.
- **Challenge run finds nothing:** `return_result` with an empty list is a valid outcome — run status `complete`, evidence count 0, no evaluation, no brief. The existing no-evidence path already handles the batch settling.
- **Server Action:** invalid `mode` returns `{ ok: false, error }` — never throws across the boundary.
- **Cascades:** `challenge_briefs` cascades from both the run and the thesis, so thesis deletion stays clean.

---

## 11. Testing (TDD)

- `lib/health/score.test.ts` — `claimHealthBreakdown`: `overall` equals `claimHealth` over all links (the load-bearing property); all-research and all-challenge inputs; empty subsets return count 0; decay respected within each subset; sub-scores deliberately *not* averaging to overall.
- `lib/ai/schemas/challenge-brief.test.ts` — accepts a valid brief; rejects negative indices, an over-long headline, more than 5 points, missing summary.
- `lib/ai/agents/challenger.test.ts` — forced-tool-use call shape (`tool_choice`, `thinking: false`, evaluator model); index→UUID mapping; out-of-range indices dropped; malformed tool output surfaces as a rejection rather than a partial write.
- `lib/ai/agents/researcher.test.ts` — new case: `mode: 'challenge'` selects the challenge system prompt and task builder, and the loop's behaviour (stop conditions, persistence, tool handling) is otherwise identical.
- `lib/db/agent-enum-sync.test.ts` — `agent_run_mode` stays in sync with `AGENT_RUN_MODES`.
- Offline end-to-end: extend the fixtured harness so a challenge run produces evidence, links, a health snapshot, and a `challenge_briefs` row, asserted together.
- UI tests deferred, per CLAUDE.md.

---

## 12. Documentation updates

Part of the phase, not a follow-up.

- **`docs/PRD.md`** — challenge runs into shipped scope; state the robo-advisor boundary explicitly (§1).
- **`docs/ARCHITECTURE.md`** — the challenger in the agent roster; run modes in Flow 1; update the extension-seam row for "devil's advocate" from *planned* to *shipped*; **correct the system diagram's "Anthropic API — Embeddings" line**, which is inaccurate (Anthropic has no embeddings endpoint) and describes a capability nothing in the codebase uses.
- **`docs/DATA_MODEL.md`** — `agent_runs.mode`, `challenge_briefs`, and an honest note that `evidence.extracted_text_embedding` is reserved and currently unwritten.
- **`docs/DESIGN.md`** — decisions for the challenge badge, the brief block, and the drill-down; the "sub-scores are not components" copy constraint.
- **`docs/phases/phase-7-challenge.md`** — new phase doc in the established format.
- **`README.md`** — architecture diagram (challenger + run modes), build status row for Phase 7, and trim the now-shipped items from "What I'd build next".
- **pgvector honesty:** `PRD.md` and `README.md` both sell pgvector for dedup and similar-evidence lookup. The column is declared and never read or written. Either the claim is softened to "reserved for planned dedup" or it is removed — this phase softens it. A reviewer who greps should not find the docs overselling the schema.

---

## 13. Cost & free-tier awareness

- **Anthropic:** a challenge run costs about what a research run costs (same loop, same 12-iteration / 100k-token budget) plus one Sonnet brief call over ≤20 evidence snippets — a few cents. Evaluation of the counter-evidence is the existing matrix, already cached by `(claimId, evidenceId, promptVersion)`. Because challenge runs are user-triggered only, steady-state spend is unchanged.
- **Inngest:** +1 step per challenge run. Negligible against 50k/month.
- **Neon:** one `challenge_briefs` row per challenge run plus the usual evidence/link rows. Negligible against 0.5 GB.
- **Vercel:** one new dynamic route per tree (app + demo).

---

## 14. File map

```
schemas/agent.ts                                      # AGENT_RUN_MODES tuple + AgentRunMode
lib/db/schema.ts                                      # agent_run_mode enum, agent_runs.mode, challenge_briefs
drizzle/                                              # generated migration
lib/db/repositories/agent-runs.ts                     # createAgentRun(thesisId, trigger, mode)
lib/db/repositories/challenge-briefs.ts               # upsertBrief, getBriefForRun, getLatestBriefForThesis
lib/db/repositories/claim-evidence-links.ts           # listLinksForClaimWithMode, listWeakeningLinksForThesis
lib/ai/agents/researcher.ts                           # mode param; loop body unchanged
lib/ai/prompts/researcher.ts                          # challengeSystemPrompt, buildChallengeTask
lib/ai/agents/challenger.ts                           # one-shot brief writer
lib/ai/prompts/challenger.ts                          # systemPrompt, task builder, CHALLENGER_PROMPT_VERSION
lib/ai/tools/return-challenge-brief.ts
lib/ai/schemas/challenge-brief.ts
lib/ai/challenge-brief-fixtures.ts
lib/health/score.ts                                   # claimHealthBreakdown
lib/inngest/client.ts                                 # mode on AgentRunRequested / AgentRunCompleted
lib/inngest/functions/run-agent.ts                    # pass + forward mode
lib/inngest/functions/evaluate-run.ts                 # mode-guarded write-challenge-brief step
lib/demo/queries.ts                                   # demo claim + brief queries
scripts/run-agent-fixture.ts                          # record a challenge scenario
scripts/seed-demo.ts                                  # seed a challenge run + brief
__fixtures__/agent-runs/nvda-challenge/                # messages, tools, evaluations, challenge-brief

# 7b
app/(app)/theses/agent-actions.ts                     # triggerAgentRun(thesisId, mode)
app/(app)/theses/[thesisId]/page.tsx                  # challenge trigger
app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx # drill-down (new)
app/(app)/theses/[thesisId]/runs/[runId]/page.tsx     # render brief
app/demo/claims/[claimId]/page.tsx                    # demo drill-down (new, force-dynamic)
components/agent/ChallengeButton.tsx
components/agent/trace/RunHeader.tsx                  # mode badge
components/agent/ChallengeBrief.tsx
components/claims/ClaimEvidenceList.tsx
components/claims/HealthSplit.tsx
components/theses/ClaimList.tsx                       # link rows into the drill-down
```

---

## 15. Open questions

None blocking. Two judgement calls made in this spec that are cheap to reverse in 7b: the brief cap of 5 points, and ordering drill-down evidence by weight rather than recency.
