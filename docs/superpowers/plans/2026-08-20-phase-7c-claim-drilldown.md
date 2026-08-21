# Phase 7c — Claim Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every claim health score explainable — a per-claim route showing which evidence moved the number, by how much, and whether it came from a research or a challenge run.

**Architecture:** One new pure module computes per-link contributions; one new joined repository query supplies the rows; one shared presentation component (`ClaimDrilldown`) is rendered by two thin routes that differ only in how they authorize and where run links point. No schema change, no migration.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Drizzle + Neon Postgres, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-phase-7c-claim-drilldown-design.md`

## Global Constraints

- **No schema change and no migration.** `recompute-health`, `claimHealth`, `thesisHealth`, `decayWeight`, `impactValue`, and `claims.current_health_score` are untouched.
- **Decay is always evaluated at `claim.currentHealthUpdatedAt`, never `new Date()`.**
- **Copy constraint (binding, from the Phase 7a spec):** the research and challenge sub-scores are independent weighted averages over different denominators. They must be presented as "what each line of inquiry found", never as components of a total that sum. No stacked bars, no percentages-of-whole.
- **A line of inquiry with zero links renders as an absence** ("No challenge runs yet"), never as a neutral `0.00`.
- **Naming: "challenge", never "bear case"** — for a short thesis the counter-case is bullish.
- `strict: true`, no `any`. Use `unknown` and narrow if unavoidable.
- Absolute imports via `@/`. Never `../../../lib/...`.
- Prefer `type` over `interface`.
- Default to Server Components. Only add `"use client"` when state, effects, or browser APIs are genuinely needed.
- All DB access goes through `lib/db/repositories/`. No raw Drizzle in components, routes, or server actions.
- Vitest collects **only** `lib/**/*.test.ts` and `schemas/**/*.test.ts`. Do not put tests elsewhere. UI components are not unit-tested on this project.
- Tests need **Node 22**. `node --version` should report v22.x; vitest fails with a cryptic `styleText` error on Node 21.
- Run `npm run typecheck` and `npm run lint` before every commit.
- **Do not run any command that writes to the database.** Dev and production share one Neon instance. Seeding is run by the repo owner, not by an implementer. Tasks that change seed code stop at typecheck + lint.

## File map

| File | Responsibility | Task |
|---|---|---|
| `lib/health/contribution.ts` | **Create.** Per-link weight, weight share, signed contribution. | 1 |
| `lib/health/contribution.test.ts` | **Create.** Six invariants including the exact-sum property. | 1 |
| `lib/challenge/select.ts` | **Modify.** Tie-break on content instead of `evidenceId`. | 2 |
| `lib/challenge/select.test.ts` | **Modify.** Rewrite one test, add two. | 2 |
| `lib/db/repositories/claim-evidence-links.ts` | **Modify.** Add `listClaimEvidenceDetail`; delete dead `listLinksForClaimWithMode`. | 3 |
| `lib/health/display.ts` | **Modify.** Receives `IMPACT_STYLE`. | 4 |
| `components/agent/trace/EvidenceCard.tsx` | **Modify.** Import `IMPACT_STYLE` instead of defining it. | 4 |
| `components/agent/HealthBar.tsx` | **Modify.** One optional `emptyLabel` prop. | 4 |
| `components/theses/HealthSplit.tsx` | **Create.** Research/challenge side by side. | 4 |
| `components/theses/ClaimEvidenceList.tsx` | **Create.** Weight-ordered rows with contributions. | 4 |
| `components/theses/ClaimDrilldown.tsx` | **Create.** Composes the drill-down; owns the decay clock. | 5 |
| `app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx` | **Create.** Auth route. | 5 |
| `components/theses/ClaimList.tsx` | **Modify.** Rows link into the drill-down. | 5 |
| `components/agent/LatestChallengeBrief.tsx` | **Create.** Bookmark card. | 6 |
| `app/(app)/theses/[thesisId]/page.tsx` | **Modify.** Render the brief card. | 6 |
| `lib/agent/trace-brief.ts` | **Create.** Shared brief loading + citation resolution. | 7 |
| `components/agent/trace/ChallengeBrief.tsx` | **Modify.** `thesisId` prop becomes `runHrefBase`. | 7 |
| `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx` | **Modify.** Use the helper. | 7 |
| `lib/demo/seed-run.ts` | **Create.** `seedFixturedRun`, extracted from the seed script. | 8 |
| `scripts/seed-demo.ts` | **Modify.** Two runs via the helper. | 8 |
| `app/demo/claims/[claimId]/page.tsx` | **Create.** Demo drill-down. | 9 |
| `app/demo/runs/[runId]/page.tsx` | **Modify.** Render the brief. | 9 |
| `app/demo/page.tsx` | **Modify.** Mode badge on runs, brief card. | 9 |
| `components/demo/DemoClaimList.tsx` | **Modify.** Rows link into the demo drill-down. | 9 |
| `docs/PRD.md`, `README.md`, `docs/DESIGN.md`, `docs/phases/phase-7-challenge.md` | **Modify.** | 10 |

---

### Task 1: Per-link contribution math

**Files:**
- Create: `lib/health/contribution.ts`
- Test: `lib/health/contribution.test.ts`

**Interfaces:**
- Consumes: `decayWeight(ageMs: number, halfLifeMs?: number): number` and `impactValue(impact: EvidenceImpact): number` from `@/lib/health/score`; `EvidenceImpact` from `@/schemas/evidence`.
- Produces: `type Weighted<T>` and `rankContributions<T extends { impact: EvidenceImpact; confidence: number; createdAt: Date }>(links: T[], now: Date): Weighted<T>[]`. Tasks 4 and 5 depend on these exact names.

**Background you need:** `claimHealth` in `lib/health/score.ts` computes `Σ(impactValue_i × w_i) / Σw` where `w_i = confidence_i × decayWeight(age_i)`. That means each link's signed contribution `impactValue_i × w_i / Σw` sums **exactly** to the claim's score. Do not "improve" this by normalising differently — the exact-sum property is the entire point of the feature and Task 1's first test asserts it.

- [ ] **Step 1: Write the failing test**

Create `lib/health/contribution.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { claimHealth } from "./score";
import { rankContributions } from "./contribution";
import type { EvidenceImpact } from "@/schemas/evidence";

const DAY = 86_400_000;
const now = new Date("2026-08-20T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

type L = { impact: EvidenceImpact; confidence: number; createdAt: Date; id: string };
function link(over: Partial<L> & { id: string }): L {
  return { impact: "strengthens", confidence: 0.5, createdAt: daysAgo(1), ...over };
}

const mixed: L[] = [
  link({ id: "a", impact: "strengthens", confidence: 0.9, createdAt: daysAgo(2) }),
  link({ id: "b", impact: "weakens", confidence: 0.8, createdAt: daysAgo(40) }),
  link({ id: "c", impact: "neutral", confidence: 0.7, createdAt: daysAgo(10) }),
  link({ id: "d", impact: "weakens", confidence: 0.2, createdAt: daysAgo(200) }),
];

describe("rankContributions", () => {
  it("contributions sum exactly to claimHealth over the same links", () => {
    const rows = rankContributions(mixed, now);
    const total = rows.reduce((acc, r) => acc + r.contribution, 0);
    expect(total).toBeCloseTo(claimHealth(mixed, now), 10);
  });

  it("weight shares sum to 1", () => {
    const rows = rankContributions(mixed, now);
    expect(rows.reduce((acc, r) => acc + r.weightShare, 0)).toBeCloseTo(1, 10);
  });

  it("a neutral link contributes nothing but still holds weight", () => {
    const rows = rankContributions(mixed, now);
    const neutral = rows.find((r) => r.id === "c");
    expect(neutral).toBeDefined();
    expect(neutral!.contribution).toBe(0);
    expect(neutral!.weightShare).toBeGreaterThan(0);
  });

  it("returns an empty list for no links", () => {
    expect(rankContributions([], now)).toEqual([]);
  });

  it("emits zeros rather than NaN when every confidence is zero", () => {
    const rows = rankContributions(
      [link({ id: "a", confidence: 0 }), link({ id: "b", confidence: 0 })],
      now,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(Number.isNaN(r.weightShare)).toBe(false);
      expect(Number.isNaN(r.contribution)).toBe(false);
      expect(r.weightShare).toBe(0);
      expect(r.contribution).toBe(0);
    }
  });

  it("orders by raw weight, so a heavy neutral outranks a light weakener", () => {
    const rows = rankContributions(
      [
        link({ id: "light-weakens", impact: "weakens", confidence: 0.1, createdAt: daysAgo(1) }),
        link({ id: "heavy-neutral", impact: "neutral", confidence: 0.95, createdAt: daysAgo(1) }),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["heavy-neutral", "light-weakens"]);
  });

  it("decays weight with age the same way the score does", () => {
    const rows = rankContributions(
      [
        link({ id: "fresh", confidence: 0.5, createdAt: daysAgo(0) }),
        link({ id: "stale", confidence: 0.5, createdAt: daysAgo(90) }),
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["fresh", "stale"]);
    // One half-life at 90 days: the stale item carries half the weight.
    expect(rows[1].weight).toBeCloseTo(rows[0].weight / 2, 6);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/health/contribution.test.ts`
Expected: FAIL — cannot resolve `./contribution`.

- [ ] **Step 3: Write the implementation**

Create `lib/health/contribution.ts`:

```ts
import type { EvidenceImpact } from "@/schemas/evidence";
import { decayWeight, impactValue } from "./score";

// One evidence link's share of a claim's health score.
//
// claimHealth is Σ(impactValue_i × w_i) / Σw, so a link's signed contribution
// impactValue_i × w_i / Σw sums EXACTLY to the claim's overall score. That is
// deliberately unlike the research/challenge split in claimHealthBreakdown,
// whose sub-scores are independent averages over different denominators and do
// not combine into the total. The UI leans on this difference, so keep the two
// straight.
//
// weightShare is tracked separately from contribution because a `neutral` link
// adds 0 to the numerator while still adding to the denominator: it dilutes the
// score toward zero. Showing contribution alone makes such a link look inert
// when it is doing real work, and "why isn't my score more extreme" is one of
// the questions this surface exists to answer.
export type Weighted<T> = T & {
  // confidence × decayWeight(age), unnormalized.
  weight: number;
  // weight / Σweight, in [0, 1]. Shares sum to 1 over any non-empty input.
  weightShare: number;
  // impactValue × weightShare. Contributions sum to claimHealth(links, now).
  contribution: number;
};

type ContributionInput = { impact: EvidenceImpact; confidence: number; createdAt: Date };

// Ranked by raw weight descending — NOT by |contribution|. A heavy `neutral`
// link is the reason a score is muted, so it belongs near the top; ranking by
// contribution magnitude would bury exactly the rows that explain the number.
// Ties keep input order (Array.sort is stable), which is cosmetic here since
// every row is rendered.
export function rankContributions<T extends ContributionInput>(
  links: T[],
  now: Date,
): Weighted<T>[] {
  const weights = links.map(
    (l) => l.confidence * decayWeight(now.getTime() - new Date(l.createdAt).getTime()),
  );
  const total = weights.reduce((acc, w) => acc + w, 0);
  return links
    .map((link, i) => {
      const weight = weights[i];
      // total is 0 when there are no links or every confidence is 0. Guard the
      // division rather than emitting NaN into the UI.
      const weightShare = total === 0 ? 0 : weight / total;
      return {
        ...link,
        weight,
        weightShare,
        contribution: impactValue(link.impact) * weightShare,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/health/contribution.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Report — do not commit**

The repo owner approves every commit before it is staged. Write your report and stop; the controller handles staging.

---

### Task 2: Content-stable tie-break in the brief selector

**Files:**
- Modify: `lib/challenge/select.ts` (the final `.sort(...)` and the comment above `selectBriefEvidence`)
- Modify: `lib/challenge/select.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `selectBriefEvidence(links, now, cap?)` keeps its shape; only ordering behaviour changes.

**Why this change exists.** `selectBriefEvidence` currently breaks weight ties with `a.evidenceId.localeCompare(b.evidenceId)`, and its comment claims this keeps the prompt stable across runs. That holds only while the evidence rows persist. `scripts/seed-demo.ts` deletes and recreates the demo thesis, so every re-seed mints fresh random UUIDs. Seeded links all carry `createdAt ≈ now`, so `decayWeight ≈ 1` and weight collapses to `confidence` alone — a `numeric(3,2)` value, so ties are the common case, not an edge case. Because the recorded brief's `evidence_indices` are positional, a reshuffled order re-pairs arguments with unrelated citations on every re-seed. Nothing errors; the demo just reads wrong.

**Known failing test.** This change makes exactly one existing test fail — `lib/challenge/select.test.ts:44`, "breaks ties deterministically by evidence id". That test constructs two links with identical content and asserts they sort by id. It is being replaced, not repaired. Eight other tests in the file pass unchanged. This has been verified; if any other test fails, stop and report.

- [ ] **Step 1: Replace the id tie-break test with content tie-break tests**

In `lib/challenge/select.test.ts`, delete this test entirely:

```ts
  it("breaks ties deterministically by evidence id", () => {
    const a = link({ evidenceId: "b-id" });
    const b = link({ evidenceId: "a-id" });
    expect(selectBriefEvidence([a, b], now).map((o) => o.evidenceId)).toEqual(["a-id", "b-id"]);
  });
```

Replace it with these three:

```ts
  it("breaks weight ties by source domain", () => {
    const a = link({ evidenceId: "e1", sourceDomain: "zeta.com" });
    const b = link({ evidenceId: "e2", sourceDomain: "alpha.com" });
    expect(selectBriefEvidence([a, b], now).map((o) => o.sourceDomain)).toEqual([
      "alpha.com",
      "zeta.com",
    ]);
  });

  it("falls through to extracted text when the domain also ties", () => {
    const a = link({ evidenceId: "e1", sourceDomain: "x.com", extractedText: "beta" });
    const b = link({ evidenceId: "e2", sourceDomain: "x.com", extractedText: "alpha" });
    expect(selectBriefEvidence([a, b], now).map((o) => o.extractedText)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("keeps ordering stable when evidence ids are regenerated", () => {
    // seed-demo deletes and recreates the demo thesis, so every re-seed mints
    // fresh evidence UUIDs and can hand them over in a different row order.
    // Seeded links share a createdAt, so weight collapses to confidence alone
    // and ties are the norm. The brief's citations are positional, so ordering
    // must depend on content, never on ids or input order.
    const content = [
      { sourceDomain: "reuters.com", extractedText: "lead times compressed" },
      { sourceDomain: "barrons.com", extractedText: "analysts split" },
      { sourceDomain: "wsj.com", extractedText: "capex guidance cut" },
    ];
    const first = selectBriefEvidence(
      content.map((c, i) => link({ evidenceId: `aaa-${i}`, ...c })),
      now,
    );
    const second = selectBriefEvidence(
      [...content].reverse().map((c, i) => link({ evidenceId: `zzz-${i}`, ...c })),
      now,
    );
    expect(second.map((o) => o.sourceDomain)).toEqual(first.map((o) => o.sourceDomain));
    expect(first.map((o) => o.sourceDomain)).toEqual([
      "barrons.com",
      "reuters.com",
      "wsj.com",
    ]);
  });
```

- [ ] **Step 2: Run the tests and verify the new ones fail**

Run: `npx vitest run lib/challenge/select.test.ts`
Expected: FAIL — the two ordering tests fail because the current sort still breaks ties on `evidenceId`.

- [ ] **Step 3: Change the tie-break**

In `lib/challenge/select.ts`, replace this line at the end of `selectBriefEvidence`:

```ts
    .sort((a, b) => b.weight - a.weight || a.evidenceId.localeCompare(b.evidenceId))
```

with:

```ts
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        (a.sourceDomain ?? "").localeCompare(b.sourceDomain ?? "") ||
        a.extractedText.localeCompare(b.extractedText),
    )
```

And replace the comment block directly above the `export function selectBriefEvidence` line:

```ts
// Rank by the same weight the health score uses, so the brief argues from the
// evidence that is actually moving the number. Ties break by id to keep the
// prompt (and therefore the fixture) stable across runs.
```

with:

```ts
// Rank by the same weight the health score uses, so the brief argues from the
// evidence that is actually moving the number.
//
// Ties break on CONTENT (source domain, then extracted text), not on
// evidenceId. Id-based ordering is only stable while the rows persist, and
// seed-demo recreates the demo thesis on every re-seed — fresh UUIDs reshuffled
// the order, and because a brief's citations are positional indices, that
// re-paired arguments with unrelated sources. Two items with the same domain
// and the same text are interchangeable, so ordering stops there.
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/challenge/select.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Nothing outside `select.test.ts` should change.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 7: Report — do not commit**

---

### Task 3: Joined evidence-detail query, and remove dead 7a code

**Files:**
- Modify: `lib/db/repositories/claim-evidence-links.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type ClaimEvidenceDetail` and `listClaimEvidenceDetail(claimId: string): Promise<ClaimEvidenceDetail[]>`. Tasks 4, 5 and 9 import both from `@/lib/db/repositories/claim-evidence-links`.

**Context:** `listLinksForClaimWithMode` was written in Phase 7a and has never had a caller — verified with a repo-wide grep. The new query supersedes it, so it is deleted here rather than left as dead code. `listLinksForClaim`, `listLinksForEvidenceIds`, `findCachedLink`, `upsertEvaluation`, and `listWeakeningLinksForThesis` all have live callers and must stay.

There is no unit test for this task: it is a single Drizzle query, and this project does not have a DB test harness. Its correctness is proven by the drill-down rendering in Task 5 and by typecheck.

- [ ] **Step 1: Add the query**

In `lib/db/repositories/claim-evidence-links.ts`, add after `listLinksForEvidenceIds`:

```ts
// Everything one claim's drill-down needs, in a single round trip: the
// evaluator's verdict, the evidence text, its source, and the mode of the run
// that found it. The link's createdAt (not the evidence's) is what decay
// weights against, matching claimHealth.
export type ClaimEvidenceDetail = {
  evidenceId: string;
  impact: EvidenceImpact;
  confidence: number;
  reasoning: string;
  createdAt: Date;
  extractedText: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDomain: string;
  agentRunId: string;
  runMode: AgentRunMode;
};

export async function listClaimEvidenceDetail(claimId: string): Promise<ClaimEvidenceDetail[]> {
  const rows = await db
    .select({
      evidenceId: claimEvidenceLinks.evidenceId,
      impact: claimEvidenceLinks.impact,
      confidence: claimEvidenceLinks.confidence,
      reasoning: claimEvidenceLinks.reasoning,
      createdAt: claimEvidenceLinks.createdAt,
      extractedText: evidence.extractedText,
      sourceUrl: sources.url,
      sourceTitle: sources.title,
      sourceDomain: sources.domain,
      agentRunId: evidence.agentRunId,
      runMode: agentRuns.mode,
    })
    .from(claimEvidenceLinks)
    .innerJoin(evidence, eq(claimEvidenceLinks.evidenceId, evidence.id))
    .innerJoin(sources, eq(evidence.sourceId, sources.id))
    .innerJoin(agentRuns, eq(evidence.agentRunId, agentRuns.id))
    .where(eq(claimEvidenceLinks.claimId, claimId));
  // confidence is numeric(3,2) — Drizzle hands it back as a string.
  return rows.map((r) => ({ ...r, confidence: Number(r.confidence) }));
}
```

- [ ] **Step 2: Delete the dead function**

Remove this entire block from the same file:

```ts
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
```

- [ ] **Step 3: Check the imports still all resolve**

After the deletion, confirm every name in the file's import list is still used. `AgentRunMode` is still needed (by the new `ClaimEvidenceDetail`), and so are `agentRuns`, `evidence`, `sources`, `ClaimEvidenceLink`, `and`, `eq`, `inArray`. If lint reports an unused import, remove that import — do not add a suppression.

- [ ] **Step 4: Verify no caller of the deleted function survives**

Run: `grep -rn "listLinksForClaimWithMode" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no output.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Report — do not commit**

---

### Task 4: Drill-down presentation components

**Files:**
- Modify: `lib/health/display.ts` (add `IMPACT_STYLE`)
- Modify: `components/agent/trace/EvidenceCard.tsx` (import it instead of defining it)
- Modify: `components/agent/HealthBar.tsx` (add one optional prop)
- Create: `components/theses/HealthSplit.tsx`
- Create: `components/theses/ClaimEvidenceList.tsx`

**Interfaces:**
- Consumes: `Weighted<T>` and `rankContributions` from `@/lib/health/contribution` (Task 1); `ClaimEvidenceDetail` from `@/lib/db/repositories/claim-evidence-links` (Task 3); `HealthBreakdown` and `claimHealthBreakdown` from `@/lib/health/score` (already exists); `MODE_LABEL: Record<AgentRunMode, string>` from `@/lib/agent/run-mode` (already exists).
- Produces: `HealthSplit({ breakdown }: { breakdown: HealthBreakdown })` and `ClaimEvidenceList({ rows, runHrefBase }: { rows: Weighted<ClaimEvidenceDetail>[]; runHrefBase: string })`. Task 5 composes both.

**Both new components are Server Components.** Do not add `"use client"` — they hold no state and use no browser APIs.

**`runHrefBase`** is a path prefix without a trailing slash: `/theses/{thesisId}/runs` in the app, `/demo/runs` in the demo. It is the only difference between the two routes, so never hardcode either one inside a component.

**Copy is not yours to reword.** The strings below are specified by the design spec, including the "not two halves" sentence, which is a binding constraint. If a string reads awkwardly, report it rather than changing it.

- [ ] **Step 1: Move `IMPACT_STYLE` into the shared display helpers**

Append to `lib/health/display.ts`:

```ts
// Impact chip styling, shared by the run-trace evidence card and the claim
// drill-down's evidence rows. Lives here with the other pure presentation
// helpers so the two surfaces cannot drift apart.
export const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;
```

In `components/agent/trace/EvidenceCard.tsx`, delete the local definition:

```ts
const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;
```

and add to its imports:

```ts
import { IMPACT_STYLE } from "@/lib/health/display";
```

This is a pure relocation. `EvidenceCard`'s markup must not change — it renders on the run trace, the highest-value screen in the app.

- [ ] **Step 2: Give `HealthBar` an overridable empty label**

In `components/agent/HealthBar.tsx`, add to the `HealthBarProps` type:

```ts
  // Text shown in the unanalyzed state. The claim drill-down's split overrides
  // it per line of inquiry ("No challenge runs yet"), because a zero-link
  // subset is an absence, not a neutral score.
  emptyLabel?: string;
```

Change the signature and the empty branch:

```tsx
export function HealthBar({
  score,
  analyzed,
  trackClassName = "w-24",
  emptyLabel = "Not analyzed",
}: HealthBarProps) {
  if (!analyzed || score === null) {
    return (
      <span className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-1.5 rounded-full border border-dashed border-zinc-300 ${trackClassName}`} />
        {emptyLabel}
      </span>
    );
  }
```

Every existing call site omits `emptyLabel` and keeps today's behaviour.

- [ ] **Step 3: Create `HealthSplit`**

Create `components/theses/HealthSplit.tsx`:

```tsx
import { HealthBar } from "@/components/agent/HealthBar";
import type { HealthBreakdown } from "@/lib/health/score";

// The two sub-scores are independent weighted averages over DIFFERENT
// denominators — they do not sum or average to `overall`. The sentence below is
// a binding copy constraint from the Phase 7a spec, not decoration: presenting
// these as parts of a total would be false. Never render them as a stacked bar
// or as percentages of a whole.
//
// A line of inquiry with no links renders as an absence, never as a neutral
// 0.00 — claimHealthBreakdown returns { score: 0, count: 0 } for an empty
// subset, and that zero is an implementation detail, not a finding.
export function HealthSplit({ breakdown }: { breakdown: HealthBreakdown }) {
  return (
    <section className="mt-8">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Lines of inquiry
      </p>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Line
          label="Research"
          score={breakdown.research.score}
          count={breakdown.research.count}
          emptyLabel="No research runs yet"
        />
        <Line
          label="Challenge"
          score={breakdown.challenge.score}
          count={breakdown.challenge.count}
          emptyLabel="No challenge runs yet"
        />
      </div>
      <p className="mt-4 max-w-prose text-xs leading-relaxed text-zinc-500">
        Each score is what that line of inquiry found on its own. They are separate weighted
        averages, not two halves of the overall score.
      </p>
    </section>
  );
}

function Line({
  label,
  score,
  count,
  emptyLabel,
}: {
  label: string;
  score: number;
  count: number;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <HealthBar
          score={score}
          analyzed={count > 0}
          trackClassName="w-24"
          emptyLabel={emptyLabel}
        />
      </div>
      {count > 0 && (
        <p className="mt-1 text-[11px] text-zinc-400">
          {count} {count === 1 ? "verdict" : "verdicts"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `ClaimEvidenceList`**

Create `components/theses/ClaimEvidenceList.tsx`:

```tsx
import Link from "next/link";
import { IMPACT_STYLE, formatHealthScore } from "@/lib/health/display";
import { MODE_LABEL } from "@/lib/agent/run-mode";
import type { Weighted } from "@/lib/health/contribution";
import type { ClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";

// Rows arrive already ranked by weight (see rankContributions) — do not re-sort
// here. Each row shows both its signed contribution and its share of total
// weight: a `neutral` verdict contributes 0.00 while still holding weight, and
// that dilution is the answer to "why isn't this score more extreme".
export function ClaimEvidenceList({
  rows,
  runHrefBase,
}: {
  rows: Weighted<ClaimEvidenceDetail>[];
  runHrefBase: string;
}) {
  return (
    <section className="mt-10">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Evidence · {rows.length}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Ordered by the weight each item carries in the score.
      </p>
      <ol className="mt-4">
        {rows.map((r) => {
          const style = IMPACT_STYLE[r.impact];
          return (
            <li
              key={r.evidenceId}
              className="border-t border-zinc-100 py-4 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                >
                  {r.sourceDomain}
                </a>
                <span className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                  <span className={`font-medium ${style.text}`}>{style.label}</span>
                </span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {r.confidence.toFixed(2)} confidence
                </span>
                <Link
                  href={`${runHrefBase}/${r.agentRunId}#evidence-${r.evidenceId}`}
                  className="ml-auto text-zinc-400 underline decoration-zinc-200 underline-offset-2 hover:text-zinc-700"
                >
                  {MODE_LABEL[r.runMode]} run →
                </Link>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-zinc-800">{r.extractedText}</p>
              <p className="mt-2 max-w-prose text-xs leading-relaxed text-zinc-500">{r.reasoning}</p>

              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
                <span className={`font-mono font-medium tabular-nums ${style.text}`}>
                  {formatHealthScore(r.contribution)} contribution
                </span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {Math.round(r.weightShare * 100)}% of weight
                </span>
                {r.impact === "neutral" && r.weightShare > 0 && (
                  <span className="text-zinc-400">dilutes toward zero</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS. Moving `IMPACT_STYLE` must not change any test outcome.

- [ ] **Step 7: Report — do not commit**

---

### Task 5: The drill-down component and the app route

**Files:**
- Create: `components/theses/ClaimDrilldown.tsx`
- Create: `app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx`
- Modify: `components/theses/ClaimList.tsx`

**Interfaces:**
- Consumes: `rankContributions` and `Weighted` from `@/lib/health/contribution` (Task 1); `listClaimEvidenceDetail` and `ClaimEvidenceDetail` from `@/lib/db/repositories/claim-evidence-links` (Task 3); `HealthSplit` and `ClaimEvidenceList` from Task 4; `claimHealthBreakdown` from `@/lib/health/score`; `getThesisForUser` from `@/lib/db/repositories/theses`; `requireUserId` from `@/lib/auth/require-user`.
- Produces: `ClaimDrilldown({ claim, ordinal, rows, runHrefBase })`. Task 9's demo route renders the same component.

**The decay clock lives in this component, and only here.** `claim.currentHealthUpdatedAt` is the instant the stored score was computed. Evaluating decay at `new Date()` instead would drift from `claims.current_health_score`, and the drift grows the longer a thesis sits un-analyzed — exactly the case this product exists to detect. Passing the stored timestamp makes the bar, the split, and the row arithmetic all agree with the number the dashboard already shows. **Do not call `new Date()` anywhere in this task.**

**Ownership needs no new repository function.** `getThesisForUser(userId, thesisId)` already scopes by `userId` and returns claims ordered by ordinal, so one lookup plus a `findIndex` enforces both ownership and claim-belongs-to-thesis. Do not add a `getClaimForUser`.

- [ ] **Step 1: Create `ClaimDrilldown`**

Create `components/theses/ClaimDrilldown.tsx`:

```tsx
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { HealthBar } from "@/components/agent/HealthBar";
import { HealthSplit } from "@/components/theses/HealthSplit";
import { ClaimEvidenceList } from "@/components/theses/ClaimEvidenceList";
import { rankContributions } from "@/lib/health/contribution";
import { claimHealthBreakdown } from "@/lib/health/score";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory } from "@/schemas/thesis";
import type { ClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";

export function ClaimDrilldown({
  claim,
  ordinal,
  rows,
  runHrefBase,
}: {
  claim: Claim;
  // 1-based display number, matching the "claim N" tag used elsewhere.
  ordinal: number;
  rows: ClaimEvidenceDetail[];
  // Path prefix for run links, without a trailing slash.
  runHrefBase: string;
}) {
  // Decay is evaluated at the instant the stored score was computed, never at
  // render time. Recomputing against `now` would drift from
  // claims.current_health_score, and the drift grows the longer a thesis sits
  // un-analyzed. Fixing the clock here makes this page reproduce the number the
  // dashboard already shows, so the contributions below sum to the bar above.
  const asOf = claim.currentHealthUpdatedAt;
  const breakdown = asOf && rows.length > 0 ? claimHealthBreakdown(rows, asOf) : null;
  const ranked = asOf && rows.length > 0 ? rankContributions(rows, asOf) : [];

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-zinc-400">{ordinal}</span>
        <CategoryBadge category={claim.category as ClaimCategory} />
      </div>

      <h1 className="mt-2.5 max-w-prose text-xl font-semibold leading-snug tracking-tight text-zinc-900">
        {claim.statement}
      </h1>

      <div className="mt-4">
        <HealthBar
          score={breakdown ? breakdown.overall : null}
          analyzed={breakdown !== null}
          trackClassName="w-36"
        />
      </div>

      {breakdown ? (
        <>
          <HealthSplit breakdown={breakdown} />
          <ClaimEvidenceList rows={ranked} runHrefBase={runHrefBase} />
        </>
      ) : (
        <p className="mt-8 max-w-prose rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-500">
          This claim hasn&apos;t been analyzed yet. Once the agent runs on this thesis, every piece of
          evidence it weighs against this claim will appear here.
        </p>
      )}
    </div>
  );
}
```

Note the narrowing: `asOf && rows.length > 0 ? ... : null` is written that way so TypeScript narrows `asOf` to a non-null `Date` inside the branch. Do not replace it with a separate `const analyzed = ...` boolean — TypeScript will not narrow through it, and the code will not compile.

- [ ] **Step 2: Create the app route**

Create `app/(app)/theses/[thesisId]/claims/[claimId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";
import { ClaimDrilldown } from "@/components/theses/ClaimDrilldown";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ thesisId: string; claimId: string }>;
}) {
  const { thesisId, claimId } = await params;
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) notFound();

  // getThesisForUser scopes by userId and orders claims by ordinal, so this one
  // lookup enforces ownership AND claim-belongs-to-thesis. A claim id from
  // another thesis simply isn't in the list.
  const index = thesis.claims.findIndex((c) => c.id === claimId);
  if (index === -1) notFound();

  const rows = await listClaimEvidenceDetail(claimId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/theses/${thesisId}`} className="text-xs text-zinc-400 hover:text-zinc-600">
        Theses / {thesis.ticker} / Claim {index + 1}
      </Link>
      <div className="mt-3.5">
        <ClaimDrilldown
          claim={thesis.claims[index]}
          ordinal={index + 1}
          rows={rows}
          runHrefBase={`/theses/${thesisId}/runs`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Link `ClaimList` rows into the route**

In `components/theses/ClaimList.tsx`, add to the imports:

```tsx
import Link from "next/link";
```

Then replace this line inside the non-editing branch:

```tsx
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
```

with:

```tsx
            <Link
              href={`/theses/${thesisId}/claims/${c.id}`}
              className="mt-1.5 block text-sm leading-relaxed text-zinc-800 hover:text-primary"
            >
              {c.statement}
            </Link>
```

`ClaimList` is already a client component and already receives `thesisId`; no other change is needed. Leave the Edit and Delete buttons exactly as they are.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 5: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Report — do not commit**

Include in your report whether anything about the empty-state copy or the layout felt wrong to you. A design pass runs after this task lands.

---

### Task 6: The latest challenge brief on the thesis page

**Files:**
- Create: `components/agent/LatestChallengeBrief.tsx`
- Modify: `app/(app)/theses/[thesisId]/page.tsx`

**Interfaces:**
- Consumes: `getLatestBriefForThesis(thesisId: string): Promise<ChallengeBrief | null>` from `@/lib/db/repositories/challenge-briefs` (already exists, currently has no caller); `formatRelativeTime(date: Date | null, now?: Date): string` from `@/lib/format/relative-time`.
- Produces: `LatestChallengeBrief({ headline, agentRunId, createdAt, runHrefBase })`. Task 9 renders the same component on `/demo`.

**This is a bookmark, not a second copy of the brief.** The run trace owns the full argument; repeating five points on the dashboard would fight the density the thesis page maintains. Render the headline and a link, nothing more.

**When there is no brief, render nothing** — not an empty state. A thesis that has never been challenged should not advertise the absence.

The `bg-challenge-panel` and `text-challenge-foreground` tokens already exist in `app/globals.css` from Phase 7b, in both light and dark variants. Use them; do not introduce new colours.

- [ ] **Step 1: Create the component**

Create `components/agent/LatestChallengeBrief.tsx`:

```tsx
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format/relative-time";

// A bookmark, not a second copy. The run trace owns the full argument; five
// points repeated here would fight the thesis page's density. The caller
// renders nothing at all when the thesis has no brief — an absence needs no
// announcement.
export function LatestChallengeBrief({
  headline,
  agentRunId,
  createdAt,
  runHrefBase,
}: {
  headline: string;
  agentRunId: string;
  createdAt: Date;
  // Path prefix for run links, without a trailing slash.
  runHrefBase: string;
}) {
  return (
    <Link
      href={`${runHrefBase}/${agentRunId}`}
      className="block rounded-xl border border-zinc-200 bg-challenge-panel px-4 py-3.5 transition-colors hover:border-zinc-300"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-challenge-foreground">
        The case against
      </p>
      <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-900">{headline}</p>
      <p className="mt-2 text-[11px] text-zinc-400">
        {formatRelativeTime(createdAt)} · View the full case →
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Render it on the thesis page**

In `app/(app)/theses/[thesisId]/page.tsx`, add to the imports:

```tsx
import { getLatestBriefForThesis } from "@/lib/db/repositories/challenge-briefs";
import { LatestChallengeBrief } from "@/components/agent/LatestChallengeBrief";
```

After the existing `const snapshots = await listSnapshotsForThesis(thesis.id);` line, add:

```tsx
  const latestBrief = await getLatestBriefForThesis(thesis.id);
```

Then in the right-hand column, insert this block immediately **before** the `<div>` that contains the "Analysis" label and `AgentRunPanel`:

```tsx
          {latestBrief && (
            <LatestChallengeBrief
              headline={latestBrief.headline}
              agentRunId={latestBrief.agentRunId}
              createdAt={latestBrief.createdAt}
              runHrefBase={`/theses/${thesis.id}/runs`}
            />
          )}
```

The column is `<div className="space-y-6">`, so the card inherits the existing rhythm — do not add margin classes to it.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 4: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Report — do not commit**

---

### Task 7: Share the trace brief between the app and demo routes

**Files:**
- Create: `lib/agent/trace-brief.ts`
- Modify: `components/agent/trace/ChallengeBrief.tsx`
- Modify: `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`

**Interfaces:**
- Consumes: `getBriefForRun` from `@/lib/db/repositories/challenge-briefs`; `listEvidenceByIds` from `@/lib/db/repositories/evidence`; `getSourcesByIds` from `@/lib/db/repositories/sources`; `resolveBriefCitations`, `CitationSource`, `ResolvedPoint` from `@/lib/agent/brief-citations`; `PersistedChallengeBriefPointsSchema` from `@/lib/ai/schemas/challenge-brief`.
- Produces: `type TraceBrief` and `loadTraceBrief(input): Promise<TraceBrief>`. Task 9's demo trace route calls it. `ChallengeBrief`'s `thesisId` prop is replaced by `runHrefBase`.

**This task is a refactor with no behaviour change.** The app trace route must render exactly as it does today. The point is that Task 9 can reuse this logic instead of duplicating ~30 lines of citation resolution into the demo route.

**Why `hasRow` is separate from `brief`:** a challenge run whose brief row exists but whose points fail validation must suppress *both* the brief and the "no counter-evidence found" state. Claiming the thesis held up while unrenderable counter-evidence exists would be a false statement. This distinction is load-bearing and was a deliberate Phase 7b decision — preserve it.

- [ ] **Step 1: Create the helper**

Create `lib/agent/trace-brief.ts`:

```ts
import "server-only";
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { listEvidenceByIds } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import {
  resolveBriefCitations,
  type CitationSource,
  type ResolvedPoint,
} from "@/lib/agent/brief-citations";
import { PersistedChallengeBriefPointsSchema } from "@/lib/ai/schemas/challenge-brief";
import type { Claim, Evidence, Source } from "@/lib/db/schema";

export type TraceBrief = {
  // True when a challenge_briefs row exists for this run, even if its points
  // failed validation. Callers need this separately from `brief`: a malformed
  // brief must suppress the "no counter-evidence found" state too, because
  // claiming the thesis held up while unrenderable counter-evidence exists
  // would be false.
  hasRow: boolean;
  // Renderable brief. Null when there is no row, or its points are malformed.
  brief: { headline: string; summary: string; points: ResolvedPoint[] } | null;
};

// A brief argues from the thesis's STANDING weakening evidence, so some cited
// items belong to earlier runs and have no card in this trace. Those are
// resolved here too, so the brief never renders a dead anchor.
export async function loadTraceBrief(input: {
  runId: string;
  claims: Claim[];
  runEvidence: Evidence[];
  sourcesById: Map<string, Source>;
}): Promise<TraceBrief> {
  const raw = await getBriefForRun(input.runId);
  if (!raw) return { hasRow: false, brief: null };

  // points is JSONB — a row written by an older or future promptVersion could be
  // shaped differently (e.g. missing evidenceIds). Validate rather than cast: a
  // malformed brief must never 500 the app's most important screen.
  const parsed = PersistedChallengeBriefPointsSchema.safeParse(raw.points);
  if (!parsed.success) return { hasRow: true, brief: null };

  const points = parsed.data;
  const citedIds = [...new Set(points.flatMap((p) => p.evidenceIds))];
  const thisRunEvidenceIds = new Set(input.runEvidence.map((e) => e.id));
  const foreignEvidence = await listEvidenceByIds(
    citedIds.filter((id) => !thisRunEvidenceIds.has(id)),
  );
  const foreignSources = await getSourcesByIds([
    ...new Set(foreignEvidence.map((e) => e.sourceId)),
  ]);
  const foreignSourceById = new Map(foreignSources.map((s) => [s.id, s]));

  const known = new Map<string, CitationSource>();
  const remember = (e: Evidence, src: Source | undefined) => {
    if (!src) return;
    known.set(e.id, {
      evidenceId: e.id,
      agentRunId: e.agentRunId,
      title: src.title ?? src.domain,
      domain: src.domain,
    });
  };
  for (const e of input.runEvidence) remember(e, input.sourcesById.get(e.sourceId));
  for (const e of foreignEvidence) remember(e, foreignSourceById.get(e.sourceId));

  return {
    hasRow: true,
    brief: {
      headline: raw.headline,
      summary: raw.summary,
      points: resolveBriefCitations(
        points,
        input.runId,
        known,
        new Map(input.claims.map((c) => [c.id, { statement: c.statement }])),
      ),
    },
  };
}
```

- [ ] **Step 2: Swap `ChallengeBrief`'s `thesisId` prop for `runHrefBase`**

In `components/agent/trace/ChallengeBrief.tsx`, change the props of `ChallengeBrief` from:

```tsx
  points,
  thesisId,
}: {
  headline: string;
  summary: string;
  points: ResolvedPoint[];
  thesisId: string;
}) {
```

to:

```tsx
  points,
  runHrefBase,
}: {
  headline: string;
  summary: string;
  points: ResolvedPoint[];
  // Path prefix for run links, without a trailing slash. The demo renders the
  // same brief under /demo/runs, so the component must not know about /theses.
  runHrefBase: string;
}) {
```

and change the earlier-run citation link from:

```tsx
                      href={`/theses/${thesisId}/runs/${c.agentRunId}#evidence-${c.evidenceId}`}
```

to:

```tsx
                      href={`${runHrefBase}/${c.agentRunId}#evidence-${c.evidenceId}`}
```

Nothing else in the file changes. `NoChallengeBrief` takes no props and is untouched.

- [ ] **Step 3: Rewrite the app trace route to use the helper**

In `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, delete these imports:

```tsx
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { listEvidenceByIds } from "@/lib/db/repositories/evidence";
import { resolveBriefCitations, type CitationSource } from "@/lib/agent/brief-citations";
import { PersistedChallengeBriefPointsSchema } from "@/lib/ai/schemas/challenge-brief";
```

and add:

```tsx
import { loadTraceBrief } from "@/lib/agent/trace-brief";
```

Then delete the whole block that starts with the comment `// Challenge runs carry a brief.` and ends with the closing brace of the `if (brief && parsedPoints?.success) { ... }` statement — everything from `const rawBrief = ...` down to and including that closing brace. Replace it with:

```tsx
  // Challenge runs carry a brief. Its citations point at the thesis's standing
  // weakening evidence, so some may belong to earlier runs and have no card here.
  const traceBrief =
    run.mode === "challenge"
      ? await loadTraceBrief({
          runId: run.id,
          claims: thesis.claims,
          runEvidence: evidence,
          sourcesById,
        })
      : { hasRow: false, brief: null };
```

Then replace the JSX block:

```tsx
      {brief && (
        <ChallengeBrief
          headline={brief.headline}
          summary={brief.summary}
          points={resolvedPoints}
          thesisId={thesisId}
        />
      )}
      {run.mode === "challenge" && !rawBrief && isTerminalStatus(run.status) && run.status !== "failed" && (
        <NoChallengeBrief />
      )}
```

with:

```tsx
      {traceBrief.brief && (
        <ChallengeBrief
          headline={traceBrief.brief.headline}
          summary={traceBrief.brief.summary}
          points={traceBrief.brief.points}
          runHrefBase={`/theses/${thesisId}/runs`}
        />
      )}
      {run.mode === "challenge" &&
        !traceBrief.hasRow &&
        isTerminalStatus(run.status) &&
        run.status !== "failed" && <NoChallengeBrief />}
```

- [ ] **Step 4: Confirm no orphaned imports remain**

Run: `npm run lint`
Expected: clean. If `getSourcesByIds` or any other import is now unused in the route, remove it — but note that `getSourcesByIds` is still used by the route for the iteration cards' sources, so it should stay.

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npx vitest run`
Expected: both clean.

- [ ] **Step 6: Report — do not commit**

State explicitly in your report that the app trace route's rendered output is unchanged, and name anything you had to decide that the plan did not cover.

---

### Task 8: Seed the demo with a challenge run

**Files:**
- Create: `lib/demo/seed-run.ts`
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: `runResearcher` and `ResearcherPersist` from `@/lib/ai/agents/researcher`; `evaluateMatrix`, `recomputeAndPersist`, `PipelineClaim` from `@/lib/ai/evaluate-pipeline`; `writeBriefForRun` from `@/lib/ai/challenge-pipeline`; `RESEARCH_SCENARIO` and `CHALLENGE_SCENARIO` from `@/lib/agent/scenario` (added in Phase 7b).
- Produces: `seedFixturedRun(opts): Promise<SeededRun>`. Nothing later consumes it; this is the last task that touches seed code.

**DO NOT RUN THE SEED SCRIPT.** Dev and production share a single Neon database — running it would rewrite live demo data. Your verification for this task is `npm run typecheck`, `npm run lint`, and `npx vitest run`. The repo owner runs the seed.

**Why extract:** `scripts/seed-demo.ts` inlines roughly forty lines of replay-and-evaluate wiring. Adding a second run inline would duplicate every line of it, and the two copies would drift.

**`positionDirection` must be typed `PositionDirection`, not `string`** — `runResearcher` requires the union. Import it from `@/schemas/thesis`.

- [ ] **Step 1: Create the shared seed helper**

Create `lib/demo/seed-run.ts`:

```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { createAgentRun, markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { findOrCreateSource } from "@/lib/db/repositories/sources";
import { createEvidence, listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import type { AnthropicLike } from "@/lib/ai/client";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { evaluateMatrix, recomputeAndPersist, type PipelineClaim } from "@/lib/ai/evaluate-pipeline";
import { writeBriefForRun } from "@/lib/ai/challenge-pipeline";
import type { AgentRunMode, AgentRunTrigger } from "@/schemas/agent";
import type { PositionDirection } from "@/schemas/thesis";

export type SeedThesis = {
  id: string;
  title: string;
  ticker: string;
  positionDirection: PositionDirection;
  timeHorizon: string;
};

export type SeededRun = {
  runId: string;
  evidenceCount: number;
  overallScore: number;
  briefWritten: boolean;
  briefReason?: string;
};

// Replay one recorded scenario end to end: researcher loop -> evidence ->
// evaluator -> health recompute, plus the challenge brief in challenge mode.
//
// Extracted from scripts/seed-demo.ts when the demo seed grew a second run —
// inlining this wiring twice would guarantee the two copies drift.
//
// OFFLINE ONLY. Every model client here reads from __fixtures__ and never calls
// Anthropic, so callers must run under USE_AI_FIXTURES=1.
export async function seedFixturedRun(opts: {
  thesis: SeedThesis;
  claims: PipelineClaim[];
  scenario: string;
  mode: AgentRunMode;
  trigger: AgentRunTrigger;
}): Promise<SeededRun> {
  const { thesis, claims, scenario, mode, trigger } = opts;

  const run = await createAgentRun(thesis.id, trigger, { mode });
  await markRunning(run.id);

  const reader = new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = {
    createMessage: async () => reader.nextMessage() as Anthropic.Message,
  };
  const toolRunner = async (): Promise<ToolResult> => ({ ok: true, output: reader.nextToolResult() });
  const toolContext: ToolContext = {
    search: { search: async () => [] },
    fetcher: async () => ({ status: 200, html: "", finalUrl: "" }),
    edgarClient: async () => [],
    useFixtures: true,
    scenario,
  };
  const persist: ResearcherPersist = {
    appendIteration: (it) => appendIteration({ agentRunId: run.id, ...it }),
    persistEvidence: async (item) => {
      const source = await findOrCreateSource({
        url: item.source_url,
        domain: hostnameOf(item.source_url),
        title: item.title,
        rawContentHash: sha256(item.extracted_text),
        contentExcerpt: item.snippet,
      });
      await createEvidence({
        agentRunId: run.id,
        sourceId: source.id,
        extractedText: item.extracted_text,
        claimIndices: item.claim_indices,
        agentReasoning: null,
      });
    },
  };

  const result = await runResearcher(
    {
      title: thesis.title,
      ticker: thesis.ticker,
      positionDirection: thesis.positionDirection,
      timeHorizon: thesis.timeHorizon,
    },
    claims.map((c) => ({ statement: c.statement })),
    [],
    { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000, toolRunner },
    scenario,
    mode,
  );
  await incrementRunTotals(run.id, {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    iterations: result.iterations,
    evidence: result.evidenceCount,
  });
  await finishRun(run.id, result.status === "failed" ? "failed" : result.status, {
    error: result.reason,
  });

  const ev = await listEvidenceForRun(run.id);
  const evalReader = new EvaluationFixtureReader(scenario);
  const evalClient: AnthropicLike = {
    createMessage: async () => evalReader.next() as Anthropic.Message,
  };
  await evaluateMatrix({
    claims,
    evidence: ev.map((e) => ({ id: e.id, extractedText: e.extractedText })),
    client: evalClient,
  });
  const { overallScore } = await recomputeAndPersist({
    thesisId: thesis.id,
    agentRunId: run.id,
    claims,
  });

  let briefWritten = false;
  let briefReason: string | undefined;
  if (mode === "challenge") {
    const briefReader = new ChallengeBriefFixtureReader(scenario);
    const briefClient: AnthropicLike = {
      createMessage: async () => briefReader.next() as Anthropic.Message,
    };
    const out = await writeBriefForRun({
      thesisId: thesis.id,
      agentRunId: run.id,
      thesis: {
        title: thesis.title,
        ticker: thesis.ticker,
        positionDirection: thesis.positionDirection,
        timeHorizon: thesis.timeHorizon,
      },
      claims: claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement })),
      client: briefClient,
    });
    briefWritten = out.written;
    briefReason = out.reason;
  }

  return { runId: run.id, evidenceCount: ev.length, overallScore, briefWritten, briefReason };
}
```

- [ ] **Step 2: Rewrite the seed script**

Replace the entire contents of `scripts/seed-demo.ts` with:

```ts
/**
 * Re-seedable demo data. Run (Node 22 + .env.local):
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/seed-demo.ts
 *
 * Seeds two fixtured runs: a research run and a challenge run with its brief.
 * Both replay __fixtures__/agent-runs/ and cost nothing.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, theses, claims as claimsTable, agentRuns, thesisHealthSnapshots } from "@/lib/db/schema";
import { seedFixturedRun } from "@/lib/demo/seed-run";
import { RESEARCH_SCENARIO, CHALLENGE_SCENARIO } from "@/lib/agent/scenario";
import { DEMO_THESIS_ID, DEMO_USER_CLERK_ID, DEMO_USER_EMAIL } from "@/lib/demo/constants";

const DEMO_THESIS = {
  title: "Long NVDA — durable AI data-center demand",
  ticker: "NVDA",
  positionDirection: "long" as const,
  timeHorizon: "6_to_12_months" as const,
};
const DEMO_CLAIMS = [
  { ordinal: 0, statement: "Data-center revenue keeps growing at a high rate year over year", category: "financial_performance" as const },
  { ordinal: 1, statement: "NVIDIA keeps its lead over competing AI accelerators", category: "competitive_position" as const },
  { ordinal: 2, statement: "Hyperscaler AI capex stays elevated through the period", category: "macro_environment" as const },
];

async function main() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: DEMO_USER_CLERK_ID, email: DEMO_USER_EMAIL, digestEnabled: false })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email: DEMO_USER_EMAIL, digestEnabled: false } })
    .returning();

  // Re-seed clean: drop the demo thesis (cascades runs/evidence/links/snapshots), recreate at the fixed id.
  await db.delete(theses).where(eq(theses.id, DEMO_THESIS_ID));
  await db.insert(theses).values({
    id: DEMO_THESIS_ID,
    userId: user.id,
    ...DEMO_THESIS,
    status: "active",
    notes: null,
  });
  await db.insert(claimsTable).values(DEMO_CLAIMS.map((c) => ({ thesisId: DEMO_THESIS_ID, ...c })));
  // Positional claim indices (researcher claim_indices, brief claim_index) are
  // resolved against this order — it must be the ordinal order, not whatever
  // Postgres returns.
  const cs = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.thesisId, DEMO_THESIS_ID))
    .orderBy(claimsTable.ordinal);
  const pipelineClaims = cs.map((c) => ({
    id: c.id,
    ordinal: c.ordinal,
    statement: c.statement,
    category: c.category,
  }));
  const seedThesis = { id: DEMO_THESIS_ID, ...DEMO_THESIS };

  // Two fixtured runs. ORDER IS LOAD-BEARING: writeBriefForRun returns
  // no_weakening_evidence without calling the model unless the thesis already
  // holds standing `weakens` links, and the research run is what supplies them.
  const research = await seedFixturedRun({
    thesis: seedThesis,
    claims: pipelineClaims,
    scenario: RESEARCH_SCENARIO,
    mode: "research",
    trigger: "scheduled",
  });
  const challenge = await seedFixturedRun({
    thesis: seedThesis,
    claims: pipelineClaims,
    scenario: CHALLENGE_SCENARIO,
    mode: "challenge",
    trigger: "manual",
  });
  if (!challenge.briefWritten) {
    console.warn(
      `WARNING: no challenge brief was written (${challenge.briefReason}). ` +
        `/demo will show the challenge run but no case-against card.`,
    );
  }

  // Backdated history → chart trend. Each snapshot needs a unique agent_run_id, so
  // anchor each to a minimal historical run (iterationsUsed = 0 → not listed by getDemoRuns).
  const day = 86_400_000;
  const trajectory = [
    { daysAgo: 21, score: 0.55 },
    { daysAgo: 14, score: 0.4 },
    { daysAgo: 7, score: 0.2 },
  ];
  for (const point of trajectory) {
    const recordedAt = new Date(Date.now() - point.daysAgo * day);
    const [anchor] = await db
      .insert(agentRuns)
      .values({ thesisId: DEMO_THESIS_ID, trigger: "scheduled", status: "complete", startedAt: recordedAt, completedAt: recordedAt, iterationsUsed: 0, inputTokens: 0, outputTokens: 0, evidenceCollected: 0 })
      .returning();
    await db.insert(thesisHealthSnapshots).values({
      thesisId: DEMO_THESIS_ID,
      agentRunId: anchor.id,
      recordedAt,
      overallScore: String(point.score),
      claimScores: pipelineClaims.map((c) => ({ claimId: c.id, ordinal: c.ordinal, score: point.score })),
    });
  }

  console.log(
    JSON.stringify(
      {
        thesisId: DEMO_THESIS_ID,
        researchRun: research.runId,
        challengeRun: challenge.runId,
        evidence: research.evidenceCount + challenge.evidenceCount,
        briefWritten: challenge.briefWritten,
        currentOverall: challenge.overallScore,
        backdatedSnapshots: trajectory.length,
        demoUrl: "/demo",
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
```

Note: each `seedFixturedRun` call ends in `recomputeAndPersist`, which writes its own health snapshot. The chart therefore gains two near-simultaneous current points on top of the three backdated ones. That is intended — it shows the challenge run moving the score.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean. Pay attention to unused-import errors in `scripts/seed-demo.ts`; the rewrite drops many imports the old version needed.

- [ ] **Step 4: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Report — do not commit, and do not run the seed**

Confirm in your report that you did not execute `scripts/seed-demo.ts`.

---

### Task 9: Demo parity

**Files:**
- Create: `app/demo/claims/[claimId]/page.tsx`
- Modify: `app/demo/runs/[runId]/page.tsx`
- Modify: `app/demo/page.tsx`
- Modify: `components/demo/DemoClaimList.tsx`

**Interfaces:**
- Consumes: `ClaimDrilldown` (Task 5); `loadTraceBrief` (Task 7); `ChallengeBrief` and `NoChallengeBrief` with the `runHrefBase` prop (Task 7); `LatestChallengeBrief` (Task 6); `listClaimEvidenceDetail` (Task 3); `getDemoThesis`, `getDemoRuns`, `getDemoRun` from `@/lib/demo/queries`; `MODE_LABEL`, `MODE_CLASS`, `showsModeBadge` from `@/lib/agent/run-mode`.
- Produces: nothing consumed by later tasks.

`/demo` is the only path a recruiter walks, so parity is not optional — the drill-down and the brief must both work there.

**Scoping needs no new guard.** `getDemoThesis()` returns the demo thesis with its claims ordered by ordinal, so a `findIndex` over `thesis.claims` is inherently scoped to `DEMO_THESIS_ID`. Do not add a `scopeToDemo` variant for claims.

- [ ] **Step 1: Create the demo drill-down route**

Create `app/demo/claims/[claimId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoThesis } from "@/lib/demo/queries";
import { listClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ClaimDrilldown } from "@/components/theses/ClaimDrilldown";

// Public, DB-reading page. A static prerender attempt breaks the Vercel build,
// so the marker is explicit rather than inferred from the dynamic segment.
export const dynamic = "force-dynamic";

export default async function DemoClaimPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const thesis = await getDemoThesis();
  if (!thesis) notFound();

  // getDemoThesis is scoped to DEMO_THESIS_ID and orders claims by ordinal, so
  // this lookup cannot reach another user's claim.
  const index = thesis.claims.findIndex((c) => c.id === claimId);
  if (index === -1) notFound();

  const rows = await listClaimEvidenceDetail(claimId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <DemoBanner />
      <Link href="/demo" className="text-xs text-zinc-400 hover:text-zinc-600">
        ← Back to the demo thesis
      </Link>
      <div className="mt-3.5">
        <ClaimDrilldown
          claim={thesis.claims[index]}
          ordinal={index + 1}
          rows={rows}
          runHrefBase="/demo/runs"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Link demo claim rows into the drill-down**

In `components/demo/DemoClaimList.tsx`, add to the imports:

```tsx
import Link from "next/link";
```

and replace:

```tsx
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
```

with:

```tsx
          <Link
            href={`/demo/claims/${c.id}`}
            className="mt-1.5 block text-sm leading-relaxed text-zinc-800 hover:text-primary"
          >
            {c.statement}
          </Link>
```

- [ ] **Step 3: Render the brief on the demo trace**

In `app/demo/runs/[runId]/page.tsx`, add to the imports:

```tsx
import { loadTraceBrief } from "@/lib/agent/trace-brief";
import { ChallengeBrief, NoChallengeBrief } from "@/components/agent/trace/ChallengeBrief";
```

`isTerminalStatus` is already imported in this file for the iteration cards — do
not add it again.

After the `const verdictsByEvidenceId = ...` assignment and before `const lastIterId = ...`, add:

```tsx
  const traceBrief =
    run.mode === "challenge"
      ? await loadTraceBrief({
          runId: run.id,
          claims: thesis.claims,
          runEvidence: evidence,
          sourcesById,
        })
      : { hasRow: false, brief: null };
```

Then, immediately after the `<RunHeader ... />` element, add:

```tsx
      {traceBrief.brief && (
        <ChallengeBrief
          headline={traceBrief.brief.headline}
          summary={traceBrief.brief.summary}
          points={traceBrief.brief.points}
          runHrefBase="/demo/runs"
        />
      )}
      {run.mode === "challenge" &&
        !traceBrief.hasRow &&
        isTerminalStatus(run.status) &&
        run.status !== "failed" && <NoChallengeBrief />}
```

- [ ] **Step 4: Show the run mode and the latest brief on `/demo`**

In `app/demo/page.tsx`, add to the imports:

```tsx
import { getLatestBriefForThesis } from "@/lib/db/repositories/challenge-briefs";
import { LatestChallengeBrief } from "@/components/agent/LatestChallengeBrief";
import { MODE_LABEL, MODE_CLASS, showsModeBadge } from "@/lib/agent/run-mode";
```

After `const runs = await getDemoRuns();`, add:

```tsx
  const latestBrief = await getLatestBriefForThesis(thesis.id);
```

In the right-hand column, insert this immediately **before** the `<p ...>Analysis runs</p>` line:

```tsx
          {latestBrief && (
            <div className="mb-6">
              <LatestChallengeBrief
                headline={latestBrief.headline}
                agentRunId={latestBrief.agentRunId}
                createdAt={latestBrief.createdAt}
                runHrefBase="/demo/runs"
              />
            </div>
          )}
```

(The column is `space-y-2`, which is too tight for this card, hence the explicit `mb-6` wrapper.)

Then, inside the run `<Link>`, replace:

```tsx
              <span className="font-medium text-zinc-800">View agent run →</span>
```

with:

```tsx
              <span className="flex items-center gap-2">
                <span className="font-medium text-zinc-800">View agent run →</span>
                {showsModeBadge(r.mode) && (
                  <span className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold ${MODE_CLASS[r.mode]}`}>
                    {MODE_LABEL[r.mode]}
                  </span>
                )}
              </span>
```

`showsModeBadge` returns false for research runs, so research cards keep today's appearance exactly.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Report — do not commit**

---

### Task 10: Documentation

**Files:**
- Modify: `docs/PRD.md`
- Modify: `README.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/phases/phase-7-challenge.md`

**Interfaces:** none — this task writes prose only.

**Read each file before editing it.** Match its existing voice, heading depth, and level of detail. These documents are part of the portfolio; a section that reads like a changelog entry is worse than no section.

Do not restate the spec. Each document has a distinct job: `PRD.md` says what the product does, `README.md` orients a visitor, `DESIGN.md` records visual decisions so the next session doesn't re-litigate them, and the phase doc records what actually shipped and why.

- [ ] **Step 1: `docs/PRD.md`**

Find the v1 scope item promising an evidence timeline "with source link, extracted text, agent's reasoning, and impact on which claim". Update the surrounding text so it describes a shipped capability rather than an intention, and name where it lives (the per-claim drill-down). If the PRD has a status or scope table, update the corresponding row.

- [ ] **Step 2: `README.md`**

Add the claim drill-down to whatever feature list or walkthrough the README already has. One or two sentences: a claim's health score is decomposed into the evidence that produced it, each item showing its signed contribution and its share of the total weight, split by whether a research or a challenge run found it. Keep the existing tone.

- [ ] **Step 3: `docs/DESIGN.md`**

Record these decisions, in the file's existing format:

- Evidence rows show **both** signed contribution and weight share. Contribution alone makes a `neutral` verdict read as inert when it is actively pulling the score toward zero; the pair is what explains a muted score.
- Rows are ordered by **raw weight, not contribution magnitude**, so a heavy neutral item stays near the top where it explains the number.
- The research/challenge split is **never** rendered as parts of a total — no stacked bar, no percentage-of-whole. The two sub-scores are independent weighted averages over different denominators. The standing copy is: "Each score is what that line of inquiry found on its own. They are separate weighted averages, not two halves of the overall score."
- A line of inquiry with zero links renders as an **absence** ("No challenge runs yet"), never as a neutral `0.00`. `HealthBar` gained an `emptyLabel` prop for this.
- The latest challenge brief on the thesis page is a **bookmark, not a second copy** — headline plus a link. The full argument stays on the run trace.
- `IMPACT_STYLE` is shared from `lib/health/display.ts` so the run-trace evidence card and the drill-down's rows cannot drift.

- [ ] **Step 4: `docs/phases/phase-7-challenge.md`**

Add a `## Phase 7c — the claim drill-down (shipped)` section and update the "Scope split" section, which currently describes 7b as covering the drill-down and `/demo` parity. Record:

- What shipped: the drill-down route, `HealthSplit`, the weighted evidence list, the brief card, and `/demo` parity.
- **The decay-clock decision and its reasoning** — evaluating at `claim.currentHealthUpdatedAt` rather than `now`, so the drill-down reproduces the stored score instead of drifting from it.
- **The contribution invariant** — contributions sum exactly to `overall`, unlike the research/challenge split, which by design does not. This is the sharpest distinction in the phase.
- **The `selectBriefEvidence` tie-break defect and its fix** — id-based tie-breaking was only stable while rows persisted, `seed-demo` recreates them, and because brief citations are positional this silently re-paired arguments with unrelated sources on every re-seed.
- Two dead 7a functions resolved: `listLinksForClaimWithMode` deleted, `getLatestBriefForThesis` given a caller.
- The still-deferred item: the 113-character headline wrap in `ChallengeBrief`.

Also close the line at the end of the 7a section that says seeding `/demo` with a challenge run "remains Phase 7c work" — it is done.

- [ ] **Step 5: Verify nothing else claims the drill-down is unbuilt**

Run: `grep -rn "7b\|Phase 7c\|drill-down\|drilldown" docs/*.md docs/phases/*.md README.md`

Read the results and fix any statement that is now false. Do not edit files under `docs/superpowers/specs/` or `docs/superpowers/plans/` — those are dated records of what was decided at the time, not living documents.

- [ ] **Step 6: Report — do not commit**

---

## Execution notes

**Commits are gated.** This project requires the repo owner's explicit approval before anything is staged or committed — including documentation. Implementers finish at a clean typecheck, lint, and test run, then report. The controller summarizes, shows the diff, and waits.

**Nothing in this plan may touch the database.** Dev and production share one Neon instance. `scripts/seed-demo.ts` is edited in Task 8 but run by the repo owner afterwards.

**A design pass follows Tasks 5, 6, and 9** per `CLAUDE.md` — re-engage the frontend-design skill and ask whether each surface would be at home inside Linear's product. The drill-down is the second-most-important screen in the app after the run trace; it earns the revision.

**Verification before the phase is done:**

1. `npm run typecheck`, `npm run lint`, `npx vitest run` all clean.
2. Repo owner re-seeds `/demo` offline: `USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local --import tsx scripts/seed-demo.ts`, and the output reports `briefWritten: true`.
3. Walk the app path: thesis → claim → drill-down → run trace → back.
4. Walk `/demo` end to end, including the demo drill-down and the demo trace's brief.
5. Confirm the drill-down's bar matches the dashboard's bar for the same claim.
6. Confirm the displayed contributions sum to that bar.
