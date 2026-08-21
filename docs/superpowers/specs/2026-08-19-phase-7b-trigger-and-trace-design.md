# Phase 7b — Challenge Trigger & Run-Trace Brief — Design

**Date:** 2026-08-19
**Phase doc:** `docs/phases/phase-7-challenge.md` (Phase 7, first UI half)
**Status:** design approved in brainstorming; ready for implementation plan.
**Builds on:** Phase 7a engine — `agent_runs.mode`, `challenge_briefs`, `challengeSystemPrompt` / `buildChallengeTask`, `writeChallengeBrief`, `writeBriefForRun`, `claimHealthBreakdown`, repos `getBriefForRun` / `getLatestBriefForThesis` / `listLinksForClaimWithMode` / `listWeakeningLinksForThesis`.
**Supersedes:** §8 of `2026-08-17-phase-7-challenge-design.md` for the surfaces in scope below. That spec was written before 7a shipped; where the two disagree, this one is current. §8's claim-drill-down and demo-parity material stands and moves to 7c.

## Goal

A signed-in user can point the agent *against* a thesis and read the result. The thesis header gains a
secondary **Challenge** action; the run trace labels the run's mode and renders the challenger's brief
above the iteration timeline, with every citation resolving to something real. The phase ends with the
challenge feature working end to end on **recorded** agent output rather than the hand-authored fixture
7a shipped with.

No new agent logic. 7b reads what the 7a engine already produces.

## Scope

**In:**

1. A `--live` capture capability on `scripts/run-agent-fixture.ts`, plus the recording session that
   replaces `__fixtures__/agent-runs/nvda-challenge/` with real output.
2. `triggerAgentRun(thesisId, mode)` — Zod-validated at the action boundary, mode-correct scenario.
3. `components/agent/ChallengeButton.tsx` and its confirmation dialog.
4. Mode badge on `RunHeader`.
5. `components/agent/ChallengeBrief.tsx` — headline, summary, points, resolved citations, and the
   no-brief result state.
6. The frontend-design pass on the trace surface; `DESIGN.md` updates.

**Deferred to 7c:** the claim drill-down route (`app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx`),
`HealthSplit`, `ClaimEvidenceList` and its per-item contribution numbers, `ClaimList` row links,
`/demo` parity (seeding a challenge run + `app/demo/claims/[claimId]/page.tsx`), and the PRD/README
updates that describe the finished feature.

**Out (unchanged from the 7a spec, YAGNI):** challenge runs on the weekly cron; per-claim challenge
runs; a "re-run the brief" button; embedding/similarity dedup; editing or dismissing a brief;
health-drop alerts.

## Correction to the 7a record

**The documented fixture-recording command does not record anything.** `docs/phases/phase-7-challenge.md`
and `__fixtures__/agent-runs/nvda-challenge/README.md` both instruct:

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge
```

— run "without `USE_AI_FIXTURES`" to capture real output. It does not. The script builds its clients
unconditionally from fixture readers:

```ts
const reader = new FixtureReader(FIXTURE_ROOT, scenario);
const client: AnthropicLike = { createMessage: async () => reader.nextMessage() as Anthropic.Message };
```

It never reads `serverEnv.USE_AI_FIXTURES` and never constructs a live client — the same is true of its
tool runner and of its evaluator, digest, and challenger clients. Running it as documented replays the
fabricated JSON and writes it to the database as though it were real. `lib/inngest/functions/run-agent.ts`
is the only code path that branches on `USE_AI_FIXTURES`.

Recording is nonetheless achievable, because every input a fixture needs is already persisted:
`agent_run_iterations` stores `response_content`, `stop_reason`, token counts, and `tool_calls` as
`{tool_name, input, output, error}`; `claim_evidence_links` and `challenge_briefs` cover the other two
files. The capability just has to be built, and building it is 7b work that neither the phase doc nor
the 7a spec accounts for.

Both documents are corrected as part of this phase.

## Decisions locked during brainstorming

1. **Record before building, not after.** One live run at the start of the phase, so every surface is
   designed and design-passed against real headline lengths, real point counts, and real reasoning text.
2. **Capture lives in `run-agent-fixture.ts` behind `--live`**, rather than a second script duplicating
   the pipeline wiring. The harness already wires researcher, evaluator, digest, and challenger against
   a real thesis and its claims; a separate recorder would have to stay in sync with all of it.
3. **7b stops at the trace.** The drill-down is the larger and more design-heavy surface, and demo
   parity reuses its components — so both move to 7c and each sub-phase stays independently reviewable.
4. **The trigger is a secondary outline button beside `AnalyzeNowButton`** — discoverable without a
   click, honestly secondary by weight, and built from components already in the repo. A split-button
   menu was rejected: it needs a shadcn `dropdown-menu` we don't have, and it hides the phase's headline
   feature behind a click.
5. **The brief renders above the iteration list**, before the timeline rail — the conclusion first, the
   working below it.
6. **Challenge runs are visually distinct but calm.** This is considered analysis, not an alarm.

## The recording

### The `--live` capability

`scripts/run-agent-fixture.ts` gains two arguments, both defaulting to current behaviour:

```
--live            real Anthropic clients + real tools; capture responses to the scenario directory
--thesis <uuid>   target a specific thesis (default: today's unordered `limit(1)`)
```

Under `--live`, each of the four `AnthropicLike` clients is the real client wrapped in a tap that pushes
every raw response onto an array, and tool execution goes through the real `buildToolContext` instead of
the fixture replayer. On completion the script writes `messages.json`, `tools.json`, `evaluations.json`,
`challenge-brief.json`, and `digest.json` into `__fixtures__/agent-runs/<scenario>/`.

Five files, not four. The harness runs the summarizer stage unconditionally, so under `--live` that call
is billed whether or not we keep its output — and `nvda-challenge/digest.json` is fabricated today for the
same reason the other four are. Capturing it costs nothing extra and removes one more invented file.

Two guards, because this script's entire documented purpose until now was *not* spending money:

- `--live` prints the thesis, scenario, and mode it is about to run and requires a typed confirmation.
- `--live` **refuses to run** when `USE_AI_FIXTURES=1` is set, rather than silently ignoring it. The
  combination is incoherent and almost certainly a mistake.

### The `--thesis` argument

Not a convenience. Both `claim_indices` (researcher) and `claim_index` (brief) are **positional** into
the ordinal-ordered claim list. A scenario recorded against one claim set and replayed against another
maps evidence and arguments onto the wrong claims — silently, because the indices stay in range. The
recording must run against the demo thesis's exact three claims, and today's `db.select().from(theses).limit(1)`
cannot express that.

### Procedure

1. Re-seed the demo (fixtured, free) so `DEMO_THESIS_ID` carries the research run's evidence and links.
2. Record: `--live --thesis <DEMO_THESIS_ID> nvda-challenge challenge`.
3. Verify a brief was written; read all four files before committing them.
4. Replace the provisional warning in the scenario README with the real, working command.

Step 1 is load-bearing. `writeBriefForRun` returns `no_weakening_evidence` and never calls the model if
the thesis has no standing `weakens` links; the seeded `nvda-happy-path` evaluations contain exactly one.
So even if the live challenge run finds nothing new, the brief has something real to argue from and the
spend is not wasted.

### Related one-line fix

`scripts/seed-demo.ts:50` selects the demo claims with no `ORDER BY`, while `run-agent-fixture.ts` orders
by `ordinal`. Postgres does not guarantee row order without `ORDER BY`, so the demo seed's positional
claim mapping currently rests on luck — and a brief carrying positional `claim_index` makes the
consequence worse. Add `.orderBy(claimsTable.ordinal)`. This is a correctness fix on the exact code path
the recording depends on, not a drive-by refactor.

## Mode plumbing

```ts
// schemas/agent.ts
export const AgentRunModeSchema = z.enum(AGENT_RUN_MODES);

// app/(app)/theses/agent-actions.ts
export async function triggerAgentRun(
  thesisId: string,
  mode: AgentRunMode = "research",
): Promise<ActionResult<{ agentRunId: string }>>
```

The action parses `mode` and returns `{ ok: false, error }` on an invalid value — never throws across the
boundary. `createAgentRun(thesisId, "manual", { mode })` already accepts the options object (7a). The
hardcoded scenario becomes mode-derived:

```ts
scenario: mode === "challenge" ? "nvda-challenge" : "nvda-happy-path"
```

This closes the quiet failure the 7a phase doc flagged: under `USE_AI_FIXTURES`, a challenge run carrying
`nvda-happy-path` replays *research* messages through the challenge loop without crashing, because
`evaluate-run` falls back to the `nvda-challenge` scenario for the brief step only — not for the
researcher's own fixture reader.

## Trigger

`components/agent/ChallengeButton.tsx`, client component, outline variant, rendered beside
`AnalyzeNowButton` in the thesis header. Shares the existing `Boolean(activeRun)` guard so neither run
type can start while another is in flight.

Clicking opens an `AlertDialog` (already in `components/ui/`) whose copy states plainly: the agent
searches for evidence *against* this thesis, it is a real API run, and it may find nothing. Confirming
calls `triggerAgentRun(thesisId, "challenge")` and `router.refresh()`.

Label: **"Challenge"**. Never "bear case" — for a `short` thesis the counter-case is bullish, so the term
is wrong half the time.

## Run trace

### Mode badge

`RunHeader` renders a mode chip in the existing metadata row. Research runs keep today's appearance
exactly — no badge, no layout shift. Challenge runs get a calm chip, following the precedent already set
by allow-list refusals, which render as a brick chip rather than a red alert.

### Brief placement

For a challenge run, `ChallengeBrief` renders between `RunHeader` and the timeline rail: headline,
summary, then up to five points. Each point names its claim and cites its evidence.

`challenge_briefs.points` stores `{ claimId, claimOrdinal, argument, evidenceIds }` — no claim statement —
so the page joins `thesis.claims` to render the statement alongside the ordinal.

### Citation resolution

The one genuinely tricky part. `evidenceIds` are drawn from the thesis's **standing** weakening links, not
this run's output, so a cited item may have been collected weeks ago by a different run and have no card
in this trace.

The page already loads this run's evidence. It additionally fetches any cited id not in that set, with its
sources, and each citation renders one of three ways:

- **From this run** — anchors to its evidence card below.
- **From an earlier run** — renders inline with source domain and title under an "earlier run" label,
  linking to that run's trace. (7c re-points this at the claim drill-down, which is the better
  destination.)
- **Unresolvable** — dropped, not rendered.

A brief must never render a dead anchor.

### No-brief state

A challenge run that reaches a terminal status with no `challenge_briefs` row shows:

> **No counter-evidence found** — the thesis held up this run.

Styled as a result, not as an empty state, because that is exactly what it is. This is the UI half of the
prompt-level property that "the thesis held up" is a correct answer rather than a failure.

## Copy discipline

Per the 7a spec's product boundary, the brief summarises counter-evidence the tool found and the evaluator
scored. It never recommends an action, never says "sell", and never assigns a probability to the thesis
being wrong. No string in this phase does either.

## Error / empty / edge states

| State | Treatment |
|---|---|
| Invalid `mode` at the action boundary | `{ ok: false, error }`; toast. No run created. |
| Challenge run still in flight | Existing `PollWhileRunning`; brief section absent until terminal. |
| Challenge run failed | Existing failure banner; no brief section. |
| Challenge run complete, no brief | The "No counter-evidence found" result state above. |
| Challenge run complete, zero evidence, brief present | Valid — the brief argues the standing case. Existing "finished without finding new evidence" note still renders below. |
| Cited evidence from an earlier run | Inline citation + "earlier run" label, linked to that trace. |
| Cited evidence id resolves to nothing | Dropped silently. |
| Research run | Byte-identical to today's trace. |

## Testing (TDD targets — infra-free)

- `AgentRunModeSchema` accepts `research` and `challenge`, rejects anything else.
- `triggerAgentRun` returns `{ ok: false }` for an invalid mode and creates no run.
- Scenario selection: `challenge` → `nvda-challenge`, `research` → `nvda-happy-path`.
- Citation resolution: an id in this run anchors; an id outside it takes the earlier-run branch; an
  unresolvable id is dropped.
- `--live` capture round-trip: with a stubbed client, the five written files are readable back by
  `FixtureReader` / `EvaluationFixtureReader` / `ChallengeBriefFixtureReader` / `DigestFixtureReader`.
  No real API call.
- `--live` refuses to run under `USE_AI_FIXTURES=1`.

## Risks

**The live run may find no new counter-evidence.** A real possibility, and by design — the prompt permits
it. Mitigated by seeding first (§ Procedure step 1) so the brief still has standing evidence to argue
from. If the recording comes back thin, re-running costs again and that call is the user's.

**The recording writes to the shared dev/prod database.** One live challenge run lands on the demo thesis
in the single Neon database that also serves `/demo`. It is removed by the next `seed-demo` run, and the
committed fixture files are the durable artifact — but the rows are real and public for that window.

## Verification

1. `npm run typecheck` passes; `npm run lint` clean.
2. `npm test` passes (Node 22).
3. Fixture files in `nvda-challenge/` are real recorded output and the provisional README warning is gone.
4. With `USE_AI_FIXTURES=1` + `npx inngest-cli dev`: Challenge → confirm → run completes → trace shows the
   mode badge, the brief, and resolving citations.
5. A research run's trace is visually unchanged.
6. Design pass run against Linear / Vercel / Granola; decisions recorded in `DESIGN.md`.

## Definition of done

- [ ] `--live` + `--thesis` on the fixture harness, with both guards.
- [ ] `nvda-challenge` recorded (five files), verified, and committed; README warning replaced.
- [ ] `seed-demo.ts` claim ordering fixed.
- [ ] `phase-7-challenge.md` and the scenario README corrected re: the recording command.
- [ ] `AgentRunModeSchema`; `triggerAgentRun(thesisId, mode)`; mode-derived scenario.
- [ ] `ChallengeButton` + confirmation dialog.
- [ ] `RunHeader` mode badge.
- [ ] `ChallengeBrief` with three-way citation resolution and the no-brief result state.
- [ ] Tests above written during implementation, not after.
- [ ] Design pass done; `DESIGN.md` updated.
- [ ] Approved before staging or committing.
