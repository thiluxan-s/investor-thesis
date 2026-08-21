# Phase 7c — Claim drill-down design

**Date:** 2026-08-20
**Status:** approved, not yet implemented
**Phase doc:** `docs/phases/phase-7-challenge.md`
**Predecessors:** `2026-08-17-phase-7-challenge-design.md` (7a engine), `2026-08-19-phase-7b-trigger-and-trace-design.md` (7b surfaces)

---

## 1. Goal

Make every health score explainable. A user opens a claim and sees which
evidence moved the number, by how much, in which direction, and whether it came
from a research run or a challenge run.

This closes Phase 7 and keeps a promise `PRD.md` has carried unfulfilled since
v1 scope: an evidence timeline "with source link, extracted text, agent's
reasoning, and impact on which claim". `claim_evidence_links` has stored the
evaluator's `impact`, `confidence`, and `reasoning` for every (claim, evidence)
pair since Phase 4, and nothing in the app has ever displayed any of it. The
claim bar has been a magic number for three phases.

## 2. Scope

**In:**

1. Claim drill-down route — `app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx`.
2. `HealthSplit` — research and challenge scores side by side, with counts.
3. Weighted evidence list with per-item score contributions.
4. `ClaimList` and `DemoClaimList` rows link into the drill-down.
5. Latest challenge brief on the thesis detail page.
6. `/demo` parity — demo drill-down route, demo trace renders the brief, demo run
   list shows mode, and the seed grows a challenge run.
7. A tie-break fix in `lib/challenge/select.ts` that demo reproducibility depends on.
8. Docs: `PRD.md`, `README.md`, `DESIGN.md`, `docs/phases/phase-7-challenge.md`.

**Out (deferred, flagged not silent):**

- The 113-character headline wrap in `ChallengeBrief`. The recorded brief's
  headline runs longer than the ~90 characters the 7b spec assumed. Cosmetic;
  its own small pass.
- Pagination or capping of the evidence list. A thesis holds at most 5 claims and
  runs are user-triggered; showing every link is correct until it isn't.
- Any change to `recompute-health`, `claimHealth`, or the stored
  `claims.current_health_score`. 7a left these untouched on purpose and so does 7c.
- Editing, dismissing, or re-running a brief.

**No schema change. No migration.**

## 3. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | Each evidence row shows **signed contribution AND weight share** | Contribution alone makes a `neutral` row read as inert, when it is actively pulling the score toward zero. Weight share is the only way to show dilution. |
| 2 | Decay is evaluated **as of `claim.currentHealthUpdatedAt`**, never `now` | Reproduces the stored score exactly, so the drill-down explains the same number the dashboard shows and the contributions sum to it. See §5. |
| 3 | The latest brief gets a **standing home on the thesis page** | A challenge run's argument was otherwise reachable only by hunting the run list. Also gives `getLatestBriefForThesis` its first caller. |
| 4 | The brief card is a **bookmark, not a second copy** | The run trace owns the argument in full; five points repeated on the dashboard would fight its density. |
| 5 | `selectBriefEvidence` ties break on **content, not `evidenceId`** | See §9. Without this the demo's brief citations shuffle on every re-seed. |
| 6 | Evidence rows sort by **weight descending, not `|contribution|`** | A heavy `neutral` row is doing real dampening work and belongs near the top. Sorting by contribution magnitude buries the rows that explain a muted score. |

## 4. Architecture and data flow

Two routes, one shared presentation component. The routes differ only in how
they authorize and where run links point.

```
app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx   auth + fetch  ─┐
app/demo/claims/[claimId]/page.tsx                      demo + fetch  ─┴→ <ClaimDrilldown/>
```

**Ownership needs no new code.** `getThesisForUser(userId, thesisId)` already
returns claims ordered by ordinal. The route does:

```ts
const thesis = await getThesisForUser(userId, thesisId);
if (!thesis) notFound();
const index = thesis.claims.findIndex((c) => c.id === claimId);
if (index === -1) notFound();
```

That enforces ownership *and* claim-belongs-to-thesis through the existing
repository path, exactly as the 7a spec required. The demo route does the same
against `getDemoThesis()`, whose claims are inherently scoped to
`DEMO_THESIS_ID` — so no new `scopeToDemo` variant and no new guard to test.

**One new query.** `listClaimEvidenceDetail(claimId)` in
`lib/db/repositories/claim-evidence-links.ts`, joining
`claim_evidence_links ⋈ evidence ⋈ sources ⋈ agent_runs`:

```ts
export type ClaimEvidenceDetail = {
  evidenceId: string;
  impact: EvidenceImpact;
  confidence: number;      // Number(numeric)
  reasoning: string;
  createdAt: Date;         // the LINK's createdAt — what decay uses
  extractedText: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDomain: string;
  agentRunId: string;
  runMode: AgentRunMode;
};

export function listClaimEvidenceDetail(claimId: string): Promise<ClaimEvidenceDetail[]>;
```

**Two dead functions die.** `listLinksForClaimWithMode` and
`getLatestBriefForThesis` were both written in 7a and have never had a caller.
The new query supersedes the first; the brief card consumes the second. Deleting
`listLinksForClaimWithMode` is part of this phase, not a follow-up.

## 5. The contribution math

New pure module `lib/health/contribution.ts`, importing `decayWeight` and
`impactValue` from `score.ts`. **`score.ts` itself is not modified.**

```ts
export type Weighted<T> = T & {
  weight: number;        // confidence × decayWeight(age) — raw, unnormalized
  weightShare: number;   // weight / Σweight ∈ [0,1] — this row's say in the score
  contribution: number;  // impactValue × weightShare
};

export function rankContributions<
  T extends { impact: EvidenceImpact; confidence: number; createdAt: Date },
>(links: T[], now: Date): Weighted<T>[];
```

### The invariant

`claimHealth` is `Σ(impactValue_i × w_i) / Σw` where `w_i = confidence_i ×
decayWeight(age_i)`. Therefore each link's signed contribution
`impactValue_i × w_i / Σw` **sums exactly to the overall score**. The clamp in
`claimHealth` is a no-op here: a weighted average of values drawn from
`{-1, 0, 1}` already lies in `[-1, 1]`.

This is the opposite of the research/challenge split, which deliberately does
*not* sum (§7). The UI must be precise about which is which — one decomposition
is exact and can say so; the other is two independent averages and must never
imply otherwise.

`weightShare` values sum to 1 for any non-empty input.

**Guard:** `Σweight === 0` (no links, or every confidence is 0) yields shares and
contributions of `0`, never `NaN`.

### The clock

`rankContributions` and `claimHealthBreakdown` are both called with
`now = claim.currentHealthUpdatedAt` — never `new Date()`.

`claims.current_health_score` is computed once at recompute time and frozen.
Because `decayWeight` is per-link, recomputing at render time drifts from the
stored value, and the drift grows the longer a thesis sits un-analyzed — exactly
the situation this product exists to detect. Evaluating at the stored timestamp
means the drill-down's bar, its split, and its row arithmetic all reproduce the
number the dashboard already shows. The page is honestly "the score as of the
last analysis", which is what the dashboard bar has always been.

`currentHealthUpdatedAt === null` means unanalyzed, which routes to the existing
empty state — so there is no null case to invent.

The drill-down's headline bar renders `breakdown.overall`, not
`claim.currentHealthScore`. They agree at display precision by construction
(`current_health_score` is `numeric(3,2)` and `formatHealthScore` rounds to two
decimals), and using the computed value keeps the page internally consistent:
the bar is the sum of the rows beneath it.

## 6. Drill-down surface

`components/theses/ClaimDrilldown.tsx` takes fully-resolved props — the claim,
the ranked rows, the breakdown, and a `runHrefBase: string` — and composes four
blocks. Both routes stay thin.

1. **Header** — claim ordinal, `CategoryBadge`, the statement at readable size,
   `HealthBar` showing `breakdown.overall`.
2. **`HealthSplit`** — §7.
3. **Evidence rows** — §8.
4. **Empty state** — when `currentHealthUpdatedAt === null` or there are no
   links: header only, using the existing "Not analyzed" convention. No split,
   no rows, no invented copy.

`runHrefBase` is `/theses/{thesisId}/runs` for the app route and `/demo/runs`
for the demo route. It is the only behavioural difference between them.

`ClaimList` (client component) and `DemoClaimList` (server component) gain links
into the route on each row.

## 7. HealthSplit and its copy constraint

`components/theses/HealthSplit.tsx` — a server component rendering research and
challenge side by side, each with a bar and its link count.

`HealthBar` gains **one optional prop**, `emptyLabel?: string`, defaulting to
today's `"Not analyzed"`. The challenge column with zero links passes
`"No challenge runs yet"`. No other change to `HealthBar`.

**The copy constraint is binding, carried forward verbatim from the 7a spec:**
the sub-scores are each a weighted average over a *different denominator*. They
do not sum, average, or otherwise combine into `overall`. The block carries one
line of copy stating plainly that these are two lines of inquiry scored
separately — never a total-and-parts framing, never a stacked bar, never a
percentage of the whole.

A line of inquiry with zero links renders as an **absence**, never as a neutral
`0.00`. An empty subset returning `{ score: 0, count: 0 }` is an implementation
detail of `claimHealthBreakdown`, not something to display.

## 8. Evidence rows

Ordered by `weight` descending (decision 6). Each row carries:

- source domain, with an outbound link to `sourceUrl`
- impact chip and confidence
- the extracted text
- **the evaluator's reasoning** — the field this whole phase exists to surface
- a footer line: signed contribution, then weight share as a percentage
- a mode-labelled link back to the originating run's trace, via `runHrefBase`

A `neutral` row shows `0.00` contribution alongside a non-zero weight share and
a short `dilutes toward zero` note. This is the answer to "why isn't my score
more extreme", and it is invisible without both numbers.

`IMPACT_STYLE` currently lives inline in `components/agent/trace/EvidenceCard.tsx`.
It moves to `lib/health/display.ts` (already the home for pure presentation
helpers with no server imports) so both components read one definition. This is
the only change to code that already ships to a user-facing screen; the other
extraction in this phase (§9) touches seed tooling only.

## 9. Demo parity

`/demo` is the only path a recruiter walks, so parity is not optional.

### The seed grows a second run

`scripts/seed-demo.ts` currently inlines ~40 lines of replay-and-evaluate
wiring. A second run inline would duplicate all of it, so that block extracts to
`lib/demo/seed-run.ts`:

```ts
export async function seedFixturedRun(opts: {
  thesisId: string;
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string };
  claims: { id: string; ordinal: number; statement: string; category: string }[];
  scenario: string;
  mode: AgentRunMode;
  trigger: AgentRunTrigger;
}): Promise<{ runId: string; evidenceCount: number; overallScore: number }>;
```

It does: `createAgentRun` → `markRunning` → `FixtureReader` replay through
`runResearcher` → `incrementRunTotals` → `finishRun` → `evaluateMatrix` →
`recomputeAndPersist`. In `challenge` mode it additionally calls
`writeBriefForRun` with a `ChallengeBriefFixtureReader`-backed client.

`seed-demo.ts` then calls it twice:

1. `nvda-happy-path` / `research` / `scheduled`
2. `nvda-challenge` / `challenge` / `manual`

**Order is load-bearing.** `writeBriefForRun` returns
`no_weakening_evidence` without calling the model unless the thesis already has
standing `weakens` links. The research run supplies them.

The file lives in `lib/demo/` beside `constants.ts`, `queries.ts`, and
`scope.ts`. No app route imports it, so it never enters a client or server
bundle.

### Re-seed safety

The challenge brief model returns **indices**, never UUIDs
(`ChallengeBriefPointSchema` has `claim_index` and `evidence_indices`), and
`writeChallengeBrief` resolves them against freshly-selected rows. So
regenerated claim and evidence ids are not a problem in themselves.

### The tie-break defect this exposes

`selectBriefEvidence` breaks weight ties with
`a.evidenceId.localeCompare(b.evidenceId)`, and its comment says this keeps the
prompt "stable across runs". That holds only while the evidence rows persist.
`seed-demo.ts` deletes and recreates the thesis, so every re-seed mints fresh
random UUIDs. Seeded links all carry `createdAt ≈ now`, so `decayWeight ≈ 1` and
weight collapses to `confidence` alone — a `numeric(3,2)` value. **Ties are the
common case there, not an edge case.**

Because the recorded brief's `evidence_indices` are positional, a reshuffled
order re-pairs arguments with different citations on each re-seed. Nothing
errors. A recruiter simply reads an argument about one thing cited to an
unrelated article.

**Fix:** break ties on a content-derived key — `sourceDomain`, then
`extractedText` — instead of `evidenceId`. Content is identical across re-seeds
of the same fixture, so ordering becomes genuinely stable. This delivers what the
existing comment already claims to want.

The `nvda-challenge` fixture is **not** re-recorded. Its indices resolve against
whatever selection returns at seed time, so a live re-recording would cost a real
API run to change nothing.

### The remaining demo gaps

- `app/demo/claims/[claimId]/page.tsx` — new, with an explicit
  `export const dynamic = "force-dynamic"`. `app/demo/runs/[runId]` gets by
  without one because its dynamic segment already forces on-demand rendering,
  but this is a public DB-reading page and a static prerender attempt breaks the
  Vercel build — a failure this repo has already hit once. The marker costs
  nothing and removes the risk.
- `app/demo/runs/[runId]/page.tsx` — render `ChallengeBrief` / `NoChallengeBrief`,
  mirroring the app trace route including the malformed-points guard.
- `app/demo/page.tsx` — run list shows the mode badge; add the latest-brief card.
- `components/demo/DemoClaimList.tsx` — rows link into the demo drill-down.

## 10. Error and edge cases

| Case | Behaviour |
|---|---|
| Claim id not in this thesis | `notFound()` |
| Thesis not owned by the user | `notFound()` via `getThesisForUser` returning null |
| Demo claim id not in the demo thesis | `notFound()` |
| Claim never analyzed (`currentHealthUpdatedAt === null`) | Header + existing "Not analyzed" empty state. No split, no rows. |
| Claim analyzed but zero links | Same empty state. |
| Every link has confidence 0 | Shares and contributions are `0`, not `NaN`. Rows still render. |
| Link `createdAt` later than the last recompute | Possible only if evaluation persisted and `recompute-health` then failed past Inngest's retries. The drill-down bar would differ from the dashboard's. **Accepted and documented** — it self-corrects on the next run and does not warrant machinery. |
| Claim deleted between page loads | `notFound()` |
| Malformed persisted brief on the demo trace | Same guard as the app route: `PersistedChallengeBriefPointsSchema.safeParse`, and a malformed brief suppresses both the brief and the "no counter-evidence" state. |
| Thesis has no brief | The brief card does not render. No empty state — a thesis never challenged should not advertise the absence. |

## 11. Testing

Vitest collects only `lib/**/*.test.ts` and `schemas/**/*.test.ts`. UI stays
untested, per project convention.

**`lib/health/contribution.test.ts`** — six properties:

1. Contributions sum to `claimHealth(links, now)` (within float epsilon).
2. Weight shares sum to 1 for non-empty input.
3. A `neutral` link has `contribution === 0` but `weightShare > 0`.
4. Empty input returns `[]`.
5. All-zero-confidence input yields no `NaN`.
6. Ordering is weight-descending, and a heavy `neutral` outranks a light `weakens`.

**`lib/challenge/select.test.ts`** — one added case: two tied-weight items keep
their relative order when their `evidenceId`s are regenerated, proving the
tie-break is content-stable.

## 12. Risks

- **The demo re-seed writes to the shared dev/prod Neon database.** There is one
  database, not two. The re-seed must be run by Thiluxan, not a subagent, and
  only under `USE_AI_FIXTURES=1` so it costs nothing.
- **The research fixture must produce at least one `weakens` link** or the demo
  challenge run yields no brief and half the phase has nothing to show. Verify
  this at seed time; the run already claimed it during the 7b recording.
- **The `IMPACT_STYLE` move touches `EvidenceCard`**, which renders on the
  highest-value screen in the app. It is a pure constant relocation with no
  layout change, but it warrants a look at the trace page afterwards.

## 13. Verification

1. `npm run typecheck` and `npm run lint` clean.
2. `npm test` — all existing tests plus the new contribution and tie-break cases.
3. Re-seed the demo offline (`USE_AI_FIXTURES=1`) and confirm two runs appear,
   the challenge run carries a brief, and the demo trace renders it.
4. Walk the app path: thesis → claim → drill-down → run trace → back.
5. Walk the demo path end to end at `/demo`.
6. Confirm the drill-down bar matches the dashboard bar for the same claim.
7. Confirm the contributions shown sum to the bar.
8. Design pass on the drill-down and the brief card, per `CLAUDE.md`.

## 14. Definition of done

- Drill-down route renders for an analyzed claim, an unanalyzed claim, and a
  claim with zero links.
- `HealthSplit` shows both lines of inquiry, renders absence rather than `0.00`,
  and carries the "not components of a total" copy.
- Every evidence row shows source, impact, confidence, extracted text, evaluator
  reasoning, contribution, weight share, and a link to its run.
- Contributions sum to the displayed overall score.
- `ClaimList` and `DemoClaimList` rows link into the drill-down.
- The thesis page and `/demo` both show the latest challenge brief when one exists.
- The demo seed produces a research run and a challenge run with a brief.
- `listLinksForClaimWithMode` is deleted; `getLatestBriefForThesis` has a caller.
- `selectBriefEvidence` ties break on content, with a test.
- `PRD.md`, `README.md`, `DESIGN.md`, and the phase doc are updated.
- `npm run typecheck`, `npm run lint`, and `npm test` all pass.
