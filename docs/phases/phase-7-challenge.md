# Phase 7 — Challenge the Thesis

**Goal:** The agent can be pointed *against* a thesis, not only at it. A challenge run searches for disconfirming evidence with the same hand-written loop, the unchanged evaluator scores it, and a new one-shot agent writes a short brief arguing the case against the thesis. A per-claim view (Phase 7b) makes every health score explainable — which evidence moved it, by how much, and whether it came from research or from a challenge.

**Prerequisite:** Phases 1–6 — shipped and merged (`main` @ `a3b8c5f`).

> **Read `docs/superpowers/specs/2026-08-17-phase-7-challenge-design.md` before touching this phase.** It is the authority on intent; this doc is the entry point and the record of what actually shipped, not a restatement.

## Why

Two gaps in the shipped product, both visible from the docs before this phase:

1. **The health score was unexplainable in the UI.** `claim_evidence_links` has stored an `impact`, a `confidence`, and the evaluator's `reasoning` for every (claim, evidence) pair since Phase 4, and nothing in the app read any of it except the score rollup. `PRD.md`'s v1 scope promises an evidence timeline "with source link, extracted text, agent's reasoning, and impact on which claim" — that was half-built. A claim rendered a bar with no way to ask *why*.
2. **The agent never looked for disconfirming evidence.** The PRD's problem statement is that investors "hold on too long — thesis quietly broke months ago," yet nothing in the loop was structurally biased toward finding that. A researcher handed a thesis and its claims will, in practice, surface confirming material. `ARCHITECTURE.md`'s Extension Seams already named "devil's advocate that explicitly looks for counter-evidence" as a designed-in seam.

The two are one feature: the challenge run is the engine, the claim drill-down is where its output lands.

## Scope split — 7a and 7b

Delivered like the 3a/3b and 4a/4b sub-phases before it:

- **Phase 7a — Challenge engine, no UI (this doc, shipped).** `agent_run_mode` enum + `agent_runs.mode`, `challenge_briefs` table, mode-aware researcher prompts, the challenger agent, the health-breakdown function, repositories, Inngest wiring, fixtures, an offline end-to-end test.
- **Phase 7b — Surfaces (next, own plan after 7a merges).** Challenge trigger on the thesis header, brief rendering on the run trace, the per-claim drill-down route, `/demo` parity, design pass, and the PRD/README/DESIGN doc updates that describe a user-visible feature — deferred until there's a UI to describe.

## Deliverables (high level) — 7a

1. Schema: `agent_run_mode` pgEnum (`research` | `challenge`), `agent_runs.mode` (not null, default `research`), `challenge_briefs` table (unique on `agent_run_id`, denormalised `thesis_id`). One migration, additive only — no existing column changed shape.
2. `lib/health/score.ts` — `claimHealthBreakdown`, a pure function alongside the untouched `claimHealth` / `thesisHealth` / `decayWeight`.
3. A second prompt pair on the researcher (`lib/ai/prompts/researcher.ts`): `challengeSystemPrompt` and `buildChallengeTask`, selected by a new `mode` parameter on `runResearcher`. The loop body is otherwise identical.
4. `lib/ai/schemas/challenge-brief.ts` and `lib/ai/tools/return-challenge-brief.ts` — the forced-tool-use contract for the brief.
5. `lib/ai/agents/challenger.ts` — `writeChallengeBrief`, a one-shot agent (the project's fifth role) that writes the case against a thesis.
6. `lib/challenge/select.ts` — `selectBriefEvidence`, ranking a thesis's standing weakening evidence by the same weight the health score uses, capped at 20.
7. `lib/ai/challenge-pipeline.ts` — `writeBriefForRun`, wiring selection → challenger → `challenge_briefs` upsert.
8. Inngest: `run-agent.ts` reads `mode` off the event and forwards it on completion; `evaluate-run.ts` runs a mode-guarded `write-challenge-brief` step after `recompute-health`.
9. `__fixtures__/agent-runs/nvda-challenge/` and `scripts/run-agent-fixture.ts` mode support, so the challenge loop, evaluation, and brief generation all run offline under `USE_AI_FIXTURES=1`.
10. Docs: `DATA_MODEL.md` (`agent_runs.mode`, `challenge_briefs`), `ARCHITECTURE.md` (challenger in the agent roster, run modes in Flow 1, the "why challenge mode doesn't fabricate negativity" section, the extension-seam row updated from *planned* to *shipped*), this phase doc.

## Notes on what actually shipped

**Run mode is orthogonal to trigger, deliberately.** `trigger` (`manual` | `scheduled`) records *who started the run*; `mode` (`research` | `challenge`) records *what it was looking for*. Keeping them as separate columns rather than folding challenge into trigger means a scheduled challenge run is representable even though nothing emits one yet — the weekly cron still only ever emits `research` runs (§ Out of scope). The default backfills every pre-Phase-7 row to `research`, which is simply true: every run before this phase was a research run.

**The loop body changed by exactly one token.** `runResearcher` takes `mode: AgentRunMode = "research"`, resolves `activeSystem` and `buildTask` from it once at the top, and the request inside the `while` loop reads `system: activeSystem` instead of the old hardcoded `system: systemPrompt`. Every stop condition, every `appendIteration` call, every tool-handling branch is unchanged and unread by mode. Two alternatives were rejected during design specifically to protect this property: extracting a shared `runToolLoop` primitive (more indirection in the single most important file in the repo, for no functional gain) and a prompt-only approach with no first-class mode column (cheaper, but the trace couldn't label a run and health couldn't split by provenance).

**Why challenge mode doesn't produce fabricated negativity.** An agent told to find counter-evidence will find *something*. Three independent layers hold this in check, and it's the most interesting property in the phase:

1. **The prompt permits an empty result.** `challengeSystemPrompt` explicitly allows "the thesis held up" as a correct answer, not a failure — an empty `return_result` is valid.
2. **The evaluator is mode-blind.** It is never told whether evidence came from a research or a challenge run, and scores impact and confidence identically either way. Weak counter-material lands as `neutral` with low confidence and contributes ≈0 to health — nothing about challenge mode can inflate a verdict.
3. **The brief may only cite evidence that survived evaluation.** `writeBriefForRun` sources its input exclusively from `listWeakeningLinksForThesis` — rows the evaluator already wrote with `impact: 'weakens'` — never the researcher's raw output. If a thesis has no such links, the pipeline returns before calling the model at all (`reason: "no_weakening_evidence"`); if the model's response is malformed or every point fails to resolve to a real claim/evidence index, `writeChallengeBrief` returns `null` and no row is written (`reason: "no_citable_brief"`). A missing brief never means the evidence it would have cited also went missing — that evidence is already persisted and already counted in health.

**Why the brief runs after evaluation, not at the end of the researcher run.** `evaluate-run.ts` runs the mode-guarded `write-challenge-brief` step on *both* of its exits — the no-new-evidence path and the evaluated path — and on the evaluated path only after `recompute-health`. (The no-new-evidence exit returns before `recompute-health` runs at all: there is no new evidence to score, so there is nothing to recompute from.) Running the brief inside `run-agent` instead would mean arguing from evidence the evaluator hasn't scored yet; running it before `recompute-health` finishes would risk the same. Placing it here also means the digest-batch settling logic (`settleBatch`) that already lives in this function doesn't need to be re-coordinated in a fourth Inngest function for a marginal gain in file separation — it stays one `step.run`, so the retry story is unchanged.

**The brief argues from the thesis's standing weakening evidence, not just this run's.** `selectBriefEvidence` is fed every `weakens` link across the thesis's claims (`listWeakeningLinksForThesis`), not the current run's evidence alone. A challenge run skips already-seen source URLs (`listRecentSourceUrlsForThesis`, unchanged from research mode), so the single strongest piece of counter-evidence may have been collected weeks earlier by a different run. Scoping the brief to only this run's findings would understate the case the tool actually holds. The consequence, and it's a real one: a challenge run reaches the brief step even when it collects zero new evidence this time — `maybeWriteBrief` is called on the `evidence.length === 0` exit specifically so a well-covered thesis whose researcher finds nothing new still shows its standing case rather than going silent. This mirrors `recompute-health`, which already recomputes from a claim's full link history rather than one run's slice.

**Naming: "challenge," never "bear case."** For a `short` thesis the counter-case is *bullish*, so "bear case" is wrong half the time. This applies to the table name, the enum value, the agent file, and every string a user will see in 7b.

**Health-split semantics.** `claimHealthBreakdown` returns `{ overall, research: { score, count }, challenge: { score, count } }`.

- `overall` is `claimHealth` computed over *every* link for the claim — identical to what `claims.current_health_score` already stores. `recompute-health` is untouched; nothing about its meaning changed.
- `research` and `challenge` are each `claimHealth` computed over their own subset of links, with a count.
- **The sub-scores deliberately do not sum, or average, to `overall`** — each is an independent weighted average over a different denominator. This is asserted directly as a unit-test property (`overall` equals `claimHealth` over all links; a research-only subset and a challenge-only subset don't reconstruct it by any simple combination). **This is a constraint on 7b's UI, not just an implementation detail:** the drill-down must present research and challenge scores as "what each line of inquiry found," never as components of a total that add up. An empty subset renders as an absence ("No challenge runs yet"), never as a neutral `0.00` — consistent with the existing "Not analyzed" convention.

**Out of scope for 7a and 7b both (YAGNI, per the design spec):**

- Challenge runs on the weekly cron. The cron keeps emitting research runs only — challenge stays user-triggered for cost control and a clearer trace story.
- Per-claim challenge runs. A challenge run always targets the whole thesis.
- A "re-run the brief" button. The brief regenerates on the thesis's next challenge run.
- Embedding/similarity dedup of counter-evidence. `evidence.extracted_text_embedding` stays declared and unwritten.
- Editing or dismissing a brief.
- Notifying the user when a challenge run breaks a thesis — that's the separate health-alerts idea.

## The fixture-recording gate

`__fixtures__/agent-runs/nvda-challenge/` exists and is exercised by the test suite, but its content is currently **hand-authored, not recorded** — the scenario's own `README.md` says so plainly: "This scenario is hand-authored for offline testing and has not yet been recorded from a live run. The messages, tool results, evaluations, and challenge brief in this directory are plausible but fabricated." It is enough to prove the pipeline works end-to-end offline under `USE_AI_FIXTURES=1`; it is not enough to show a recruiter.

**This blocks 7b's demo-seed work.** Before `/demo` seeds a challenge run and brief, this scenario must be replaced by a real recording — run the recording command from the scenario's `README.md` against the live Anthropic API, with approval and real cost, using `--live` and `--thesis`:

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge \
  --live --thesis <demo-thesis-id>
```

`--thesis` is not optional for a re-recording: `claim_indices` and the brief's `claim_index` are positional into the ordinal-ordered claim list of whichever thesis is used, so recording against a different claim set silently maps arguments onto the wrong claims — the indices stay in range, so nothing errors. `--live` also refuses to run alongside `USE_AI_FIXTURES=1` and prompts for typed confirmation ("record") before it spends anything.

— then capture the real messages/tools/evaluations/brief into the fixture files (the harness only overwrites the files whose sink was non-empty this run, so a short-circuited brief or digest leaves the existing committed file alone), and delete the warning. `/demo` is the only path a recruiter walks; it cannot show fabricated content passed off as agent output.

## What 7a leaves wired but untriggered

Nothing in the app sends `mode: "challenge"` yet — the trigger is 7b's. Two things the trigger must get right:

**It must send `scenario: "nvda-challenge"` alongside the mode.** `triggerAgentRun` (`app/(app)/theses/agent-actions.ts`) currently hardcodes `scenario: "nvda-happy-path"` for every run. Under `USE_AI_FIXTURES`, a challenge run carrying that scenario replays the *research* fixture's messages through the challenge loop — a dev run that looks like it worked and didn't. It won't crash: `evaluate-run` falls back to the `nvda-challenge` scenario when the requested one has no `challenge-brief.json`, so the failure is quiet rather than loud. That fallback covers the brief step only, not the researcher's own fixture reader.

**The `mode` argument needs Zod validation at the server-action boundary**, like every other action input, and `createAgentRun(thesisId, trigger, { mode })` takes it through the options object.

---

7b (challenge trigger, brief rendering, the per-claim drill-down, `/demo` parity, design pass) gets its own plan. Read the design spec's UI section as a starting point, not a finished design — it was written before 7a shipped, and the health-split and `claimOrdinal` constraints above are firmer than anything it says about layout.
