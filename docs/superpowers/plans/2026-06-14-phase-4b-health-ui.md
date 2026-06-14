# Phase 4b — Health UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Phase 4a evaluation engine in the UI — a reusable health bar on claims and thesis rows, evaluator verdicts on the trace evidence cards, and a Recharts thesis-health-over-time line chart — all reading the data 4a already persists.

**Architecture:** Pure display/mapping helpers in `lib/health/display.ts` and `lib/agent/evidence-verdicts.ts` (unit-tested, TDD). Presentational React components consume them. No new Server Actions — every surface reads through existing repositories in Server Components; the one repo change extends the theses list query with an aggregate. The unanalyzed state (`current_health_updated_at IS NULL` / no snapshot) renders a dashed "Not analyzed" placeholder, never a fabricated `0.00`.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript (strict), Tailwind v4 (`bg-health-*` / `text-health-*` tokens already wired in `app/globals.css`), Recharts (new dep, pre-approved in CLAUDE.md), Motion 12.40 (installed), Vitest (Node 22), Drizzle + Neon.

**Conventions (from CLAUDE.md):** no `any`; numeric columns come back from Drizzle as **strings** — convert with `Number()`/`String()` at boundaries; absolute `@/` imports; default to Server Components, add `"use client"` only when needed; UI component tests are deferred (TDD the pure helpers, verify components by typecheck + manual load); engage the frontend-design skill per surface and run a design pass; `npm run typecheck` + `npm run lint` before every commit; tests need Node 22 (`nvm use 22`).

**Design language (from DESIGN.md):** zinc neutrals, deep-blue `#1E3A5F` accent (`--primary`), health colors `--health-strong #1F7A4D` / `--health-neutral #A1A1AA` / `--health-weak #C0492F` exposed as `bg-health-*` / `text-health-*` / `border-health-*`. Geist Mono (`font-mono`) for numeric/health values. Flat over carded; whitespace over borders.

**Approval workflow:** This project requires explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, and wait for approval before committing.

---

## File Structure

**Create:**
- `lib/health/display.ts` — pure presentation helpers: `healthTone`, `formatHealthScore`, `healthBarFill`, `HEALTH_DEADBAND`.
- `lib/health/display.test.ts` — unit tests for the above.
- `lib/agent/evidence-verdicts.ts` — `buildEvidenceVerdicts` (maps researcher `claimIndices` + claims + links → per-claim verdicts) + `EvidenceVerdict` type.
- `lib/agent/evidence-verdicts.test.ts` — unit tests.
- `components/agent/HealthBar.tsx` — reusable −1..1 bar with analyzed/unanalyzed states.
- `components/theses/HealthChart.tsx` — `"use client"` Recharts overall-health line.

**Modify:**
- `package.json` / lockfile — add `recharts`.
- `lib/db/repositories/theses.ts` — extend `ThesisListItem` + `listThesesByUser` with `avgHealth` + `healthUpdatedAt`.
- `components/theses/ThesisRow.tsx` — render `HealthBar` when analyzed, else keep the placeholder.
- `components/theses/ClaimList.tsx` — a `HealthBar` per claim, gated on `currentHealthUpdatedAt`.
- `components/agent/trace/EvidenceCard.tsx` — render verdicts (impact/confidence + expandable reasoning) instead of bare `claim N` tags.
- `components/agent/trace/IterationCard.tsx` — forward `verdictsByEvidenceId` to `EvidenceCard`.
- `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx` — load links, build verdict map, pass down.
- `app/(app)/theses/[thesisId]/page.tsx` — render `HealthChart` + a thesis-level health summary.
- `docs/DESIGN.md` — record the Phase 4b decisions.

---

## Task 1: Install Recharts

**Files:**
- Modify: `package.json`, lockfile

- [ ] **Step 1: Install**

Run: `npm install recharts`
Expected: `recharts` added to `dependencies`; lockfile updated.

- [ ] **Step 2: Verify the install resolves**

Run: `node -e "console.log(require('recharts/package.json').version)"`
Expected: prints a version (e.g. `2.x` or `3.x`).

- [ ] **Step 3: Typecheck still clean**

Run: `npm run typecheck`
Expected: clean (no usage yet, just confirms the dep didn't break resolution).

- [ ] **Step 4: Commit** (after approval)

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for the thesis health chart"
```

---

## Task 2: Health display helpers (`lib/health/display.ts`)

Pure functions the UI needs: which tone a continuous score reads as, how to format it, and the colored-segment geometry for the bar. TDD.

**Files:**
- Create: `lib/health/display.ts`
- Create: `lib/health/display.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/health/display.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { healthTone, formatHealthScore, healthBarFill, HEALTH_DEADBAND } from "./display";

describe("healthTone", () => {
  it("reads strong/weak outside the deadband, neutral inside", () => {
    expect(healthTone(0.5)).toBe("strong");
    expect(healthTone(-0.5)).toBe("weak");
    expect(healthTone(0)).toBe("neutral");
    expect(healthTone(HEALTH_DEADBAND)).toBe("neutral"); // boundary is inclusive-neutral
    expect(healthTone(HEALTH_DEADBAND + 0.01)).toBe("strong");
    expect(healthTone(-HEALTH_DEADBAND - 0.01)).toBe("weak");
  });
});

describe("formatHealthScore", () => {
  it("uses an explicit sign and two decimals, with a true minus glyph", () => {
    expect(formatHealthScore(0.42)).toBe("+0.42");
    expect(formatHealthScore(-0.42)).toBe("−0.42"); // U+2212
    expect(formatHealthScore(0)).toBe("0.00");
  });
  it("never renders a signed zero from rounding", () => {
    expect(formatHealthScore(-0.001)).toBe("0.00");
  });
  it("clamps to [-1, 1]", () => {
    expect(formatHealthScore(1.5)).toBe("+1.00");
    expect(formatHealthScore(-1.5)).toBe("−1.00");
  });
});

describe("healthBarFill", () => {
  it("fills right from center for positive, left for negative", () => {
    expect(healthBarFill(0)).toEqual({ leftPct: 50, widthPct: 0 });
    expect(healthBarFill(1)).toEqual({ leftPct: 50, widthPct: 50 });
    expect(healthBarFill(-1)).toEqual({ leftPct: 0, widthPct: 50 });
    expect(healthBarFill(0.5)).toEqual({ leftPct: 50, widthPct: 25 });
    expect(healthBarFill(-0.5)).toEqual({ leftPct: 25, widthPct: 25 });
  });
  it("clamps out-of-range scores", () => {
    expect(healthBarFill(2)).toEqual({ leftPct: 50, widthPct: 50 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `nvm use 22 >/dev/null && npx vitest run lib/health/display.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/health/display.ts`:
```ts
// Pure presentation helpers for health scores in [-1, 1]. No server imports —
// safe to use in client components.

// Scores within ±this of 0 read neutral (zinc), so a barely-positive score
// doesn't glow green. Outside the band, the sign picks strong/weak.
export const HEALTH_DEADBAND = 0.15;

export function healthTone(score: number): "strong" | "neutral" | "weak" {
  if (score > HEALTH_DEADBAND) return "strong";
  if (score < -HEALTH_DEADBAND) return "weak";
  return "neutral";
}

// Always two decimals with an explicit sign; uses a true minus glyph (U+2212)
// to match the mono numeric style. Rounds before deciding the sign so a value
// like -0.001 shows "0.00", not "−0.00".
export function formatHealthScore(score: number): string {
  const clamped = Math.max(-1, Math.min(1, score));
  const fixed = Math.abs(clamped).toFixed(2);
  if (fixed === "0.00") return "0.00";
  return clamped > 0 ? `+${fixed}` : `−${fixed}`;
}

// Colored-segment geometry for a centered −1..1 bar. The track is 0..100 with
// center at 50; positive scores fill right (green), negative fill left (red).
export function healthBarFill(score: number): { leftPct: number; widthPct: number } {
  const clamped = Math.max(-1, Math.min(1, score));
  const half = Math.abs(clamped) * 50;
  return clamped >= 0 ? { leftPct: 50, widthPct: half } : { leftPct: 50 - half, widthPct: half };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/health/display.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit** (after approval)

```bash
git add lib/health/display.ts lib/health/display.test.ts
git commit -m "feat: add pure health display helpers (tone, format, bar geometry)"
```

---

## Task 3: `HealthBar` component

Reusable bar used by claim rows, thesis rows, and the detail summary. Server component (no client interactivity). Unanalyzed → dashed "Not analyzed" track; analyzed → centered fill + mono numeric value.

**Files:**
- Create: `components/agent/HealthBar.tsx`

> **Engage the frontend-design skill** for this component before finalizing the markup.

- [ ] **Step 1: Implement**

`components/agent/HealthBar.tsx`:
```tsx
import { healthTone, formatHealthScore, healthBarFill } from "@/lib/health/display";

const TONE_FILL = {
  strong: "bg-health-strong",
  neutral: "bg-health-neutral",
  weak: "bg-health-weak",
} as const;
const TONE_TEXT = {
  strong: "text-health-strong",
  neutral: "text-zinc-500",
  weak: "text-health-weak",
} as const;

type HealthBarProps = {
  // Health score in [-1, 1]. May be null when unanalyzed.
  score: number | null;
  // Whether this claim/thesis has been analyzed at least once. When false the
  // bar shows the dashed "Not analyzed" state regardless of score.
  analyzed: boolean;
  // Track width; bars on dense rows are narrower than the detail summary.
  trackClassName?: string;
};

export function HealthBar({ score, analyzed, trackClassName = "w-24" }: HealthBarProps) {
  if (!analyzed || score === null) {
    return (
      <span className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-1.5 rounded-full border border-dashed border-zinc-300 ${trackClassName}`} />
        Not analyzed
      </span>
    );
  }
  const tone = healthTone(score);
  const { leftPct, widthPct } = healthBarFill(score);
  return (
    <span className="flex items-center gap-2">
      <span className={`relative h-1.5 overflow-hidden rounded-full bg-zinc-100 ${trackClassName}`}>
        {/* center tick */}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-zinc-300" aria-hidden />
        <span
          className={`absolute top-0 h-full rounded-full ${TONE_FILL[tone]}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </span>
      <span className={`font-mono text-xs tabular-nums ${TONE_TEXT[tone]}`}>{formatHealthScore(score)}</span>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** (after approval)

```bash
git add components/agent/HealthBar.tsx
git commit -m "feat: add reusable HealthBar with analyzed/unanalyzed states"
```

---

## Task 4: Extend the theses list query with aggregate health

The list row needs the thesis-level average **and** whether any analysis has happened — a thesis never analyzed has claim scores defaulting to `0.00`, which must stay the "Not analyzed yet" placeholder, not a fabricated neutral bar. `max(current_health_updated_at)` is the analyzed signal (NULL = never analyzed).

**Files:**
- Modify: `lib/db/repositories/theses.ts:7` (`ThesisListItem` type) and `lib/db/repositories/theses.ts:46-55` (`listThesesByUser`)

- [ ] **Step 1: Extend the type**

In `lib/db/repositories/theses.ts`, replace line 7:
```ts
export type ThesisListItem = Thesis & {
  claimCount: number;
  // Mean of the claims' current_health_score in [-1, 1]; 0 when unanalyzed.
  avgHealth: number;
  // Most recent claim health update across the thesis; null = never analyzed.
  healthUpdatedAt: Date | null;
};
```

- [ ] **Step 2: Extend the query**

Replace the body of `listThesesByUser` (lines 46-55) with:
```ts
export async function listThesesByUser(userId: string): Promise<ThesisListItem[]> {
  const rows = await db
    .select({
      thesis: theses,
      claimCount: sql<number>`count(${claims.id})::int`,
      avgHealth: sql<number>`coalesce(avg(${claims.currentHealthScore}), 0)::float`,
      healthUpdatedAt: sql<string | null>`max(${claims.currentHealthUpdatedAt})`,
    })
    .from(theses)
    .leftJoin(claims, eq(claims.thesisId, theses.id))
    .where(eq(theses.userId, userId))
    .groupBy(theses.id)
    .orderBy(desc(theses.updatedAt));
  return rows.map((r) => ({
    ...r.thesis,
    claimCount: Number(r.claimCount),
    avgHealth: Number(r.avgHealth),
    healthUpdatedAt: r.healthUpdatedAt ? new Date(r.healthUpdatedAt) : null,
  }));
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit** (after approval)

```bash
git add lib/db/repositories/theses.ts
git commit -m "feat: return aggregate health and analyzed-at on the theses list query"
```

---

## Task 5: Thesis-level health on the list row

**Files:**
- Modify: `components/theses/ThesisRow.tsx`

> **Engage the frontend-design skill** — the row is a dense data surface; the bar must sit in the existing middle grid column without breaking the three-column layout.

- [ ] **Step 1: Render the bar (or placeholder)**

In `components/theses/ThesisRow.tsx`, add the import:
```tsx
import { HealthBar } from "@/components/agent/HealthBar";
```
Replace the existing middle column block:
```tsx
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="h-1.5 w-20 rounded-full border border-dashed border-zinc-300" />
        Not analyzed yet
      </div>
```
with:
```tsx
      <HealthBar
        score={thesis.avgHealth}
        analyzed={thesis.healthUpdatedAt !== null}
        trackClassName="w-20"
      />
```

> Note: when unanalyzed, `HealthBar` already renders a dashed track + "Not analyzed" — the same treatment the old inline placeholder gave, now driven by `healthUpdatedAt` rather than hardcoded.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

Run the app (`npm run dev`), open `/theses`. Expected: analyzed theses show a colored centered bar + score; never-analyzed theses still read "Not analyzed".

- [ ] **Step 4: Commit** (after approval)

```bash
git add components/theses/ThesisRow.tsx
git commit -m "feat: show thesis-level health on the theses list rows"
```

---

## Task 6: Per-claim health on `ClaimList`

**Files:**
- Modify: `components/theses/ClaimList.tsx`

`ClaimList` is already `"use client"`; `HealthBar` is a plain presentational component and renders fine inside it. The `Claim` type carries `currentHealthScore` (string) and `currentHealthUpdatedAt` (Date | null).

> **Engage the frontend-design skill** — place the bar so it reads as the claim's status without competing with the statement text (e.g. right-aligned on the category row).

- [ ] **Step 1: Render a bar per claim**

In `components/theses/ClaimList.tsx`, add the import:
```tsx
import { HealthBar } from "@/components/agent/HealthBar";
```
In the non-editing claim branch, change the category row so the bar sits opposite the index + category. Replace:
```tsx
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-zinc-400">{idx + 1}</span>
              <CategoryBadge category={c.category as ClaimCategory} />
            </div>
```
with:
```tsx
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-zinc-400">{idx + 1}</span>
                <CategoryBadge category={c.category as ClaimCategory} />
              </div>
              <HealthBar
                score={Number(c.currentHealthScore)}
                analyzed={c.currentHealthUpdatedAt !== null}
                trackClassName="w-20"
              />
            </div>
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

Open a thesis detail page. Expected: each analyzed claim shows a health bar; unanalyzed claims show "Not analyzed".

- [ ] **Step 4: Commit** (after approval)

```bash
git add components/theses/ClaimList.tsx
git commit -m "feat: show per-claim health bars on the claim list"
```

---

## Task 7: Evidence verdict mapping (`lib/agent/evidence-verdicts.ts`)

The researcher's `claimIndices` are **positions** in the run's claim list (ordered by ordinal); the evaluator's links are keyed by `claimId`. This pure helper joins them into per-tag verdicts the card can render. A link may be absent (claim added after the run, or evaluation still pending) → `impact: null`. TDD.

**Files:**
- Create: `lib/agent/evidence-verdicts.ts`
- Create: `lib/agent/evidence-verdicts.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/agent/evidence-verdicts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildEvidenceVerdicts } from "./evidence-verdicts";

const claims = [
  { id: "c0", statement: "Claim zero" },
  { id: "c1", statement: "Claim one" },
  { id: "c2", statement: "Claim two" },
];
const links = [
  { claimId: "c0", impact: "strengthens" as const, confidence: "0.80", reasoning: "supports" },
  { claimId: "c2", impact: "weakens" as const, confidence: "0.60", reasoning: "against" },
];

describe("buildEvidenceVerdicts", () => {
  it("maps each tagged index to its claim + link verdict", () => {
    const out = buildEvidenceVerdicts([0, 2], claims, links);
    expect(out).toEqual([
      { claimNumber: 1, statement: "Claim zero", impact: "strengthens", confidence: 0.8, reasoning: "supports" },
      { claimNumber: 3, statement: "Claim two", impact: "weakens", confidence: 0.6, reasoning: "against" },
    ]);
  });

  it("yields a pending verdict when no link exists for the claim", () => {
    const out = buildEvidenceVerdicts([1], claims, links);
    expect(out).toEqual([
      { claimNumber: 2, statement: "Claim one", impact: null, confidence: null, reasoning: null },
    ]);
  });

  it("skips indices out of range (claim deleted since the run)", () => {
    expect(buildEvidenceVerdicts([5], claims, links)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `nvm use 22 >/dev/null && npx vitest run lib/agent/evidence-verdicts.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/agent/evidence-verdicts.ts`:
```ts
import type { EvidenceImpact } from "@/schemas/evidence";

export type EvidenceVerdict = {
  // 1-based display number (index + 1), matching the existing "claim N" tag.
  claimNumber: number;
  statement: string;
  // null when the (claim, evidence) pair has no link yet (pending / not evaluated).
  impact: EvidenceImpact | null;
  confidence: number | null;
  reasoning: string | null;
};

// `claimIndices` are positions into `claims` (ordered by ordinal, as the
// researcher saw them). `links` are this evidence's claim_evidence_links.
export function buildEvidenceVerdicts(
  claimIndices: number[],
  claims: { id: string; statement: string }[],
  links: { claimId: string; impact: EvidenceImpact; confidence: string; reasoning: string }[],
): EvidenceVerdict[] {
  const linkByClaimId = new Map(links.map((l) => [l.claimId, l]));
  const verdicts: EvidenceVerdict[] = [];
  for (const idx of claimIndices) {
    const claim = claims[idx];
    if (!claim) continue; // claim deleted since the run
    const link = linkByClaimId.get(claim.id);
    verdicts.push({
      claimNumber: idx + 1,
      statement: claim.statement,
      impact: link ? link.impact : null,
      confidence: link ? Number(link.confidence) : null,
      reasoning: link ? link.reasoning : null,
    });
  }
  return verdicts;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/agent/evidence-verdicts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (after approval)

```bash
git add lib/agent/evidence-verdicts.ts lib/agent/evidence-verdicts.test.ts
git commit -m "feat: add evidence-verdict mapping helper"
```

---

## Task 8: Render verdicts on the trace evidence cards

Wire the links through the trace page → `IterationCard` → `EvidenceCard`. Verdict tags are color-coded by impact; reasoning is expandable via a native `<details>` so `EvidenceCard` stays a server component.

**Files:**
- Modify: `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`
- Modify: `components/agent/trace/IterationCard.tsx`
- Modify: `components/agent/trace/EvidenceCard.tsx`

> **Engage the frontend-design skill** — the verdict tags live on the dense trace surface (the app's wow moment); keep them calm and scannable, reasoning hidden until expanded.

- [ ] **Step 1: Load links + build the verdict map in the trace page**

In `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, add imports:
```tsx
import { listLinksForEvidenceIds } from "@/lib/db/repositories/claim-evidence-links";
import { buildEvidenceVerdicts, type EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
```
Replace the data-loading block (lines 24-28) with:
```tsx
  const [iterations, evidence] = await Promise.all([listIterations(run.id), listEvidenceForRun(run.id)]);
  const srcRows = await getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]);
  const sourcesById = new Map(srcRows.map((s) => [s.id, s]));

  // Evaluator verdicts for this run's evidence, mapped to the researcher's
  // claim tags. thesis.claims is ordered by ordinal (getThesisForUser), matching
  // the positional claimIndices the researcher recorded.
  const links = await listLinksForEvidenceIds(evidence.map((e) => e.id));
  const linksByEvidenceId = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByEvidenceId.get(l.evidenceId) ?? [];
    arr.push(l);
    linksByEvidenceId.set(l.evidenceId, arr);
  }
  const verdictsByEvidenceId = new Map<string, EvidenceVerdict[]>(
    evidence.map((e) => [
      e.id,
      buildEvidenceVerdicts(e.claimIndices, thesis.claims, linksByEvidenceId.get(e.id) ?? []),
    ]),
  );

  // Evidence is attached to the LAST iteration (return_result) in v1; group there.
  const lastIterId = iterations.at(-1)?.id;
```
Then pass the map to each `IterationCard` — change the JSX:
```tsx
          <IterationCard
            key={it.id}
            iteration={it}
            index={idx}
            active={!isTerminalStatus(run.status) && idx === iterations.length - 1}
            evidence={it.id === lastIterId ? evidence : []}
            sourcesById={sourcesById}
            verdictsByEvidenceId={verdictsByEvidenceId}
          />
```

- [ ] **Step 2: Forward the prop through `IterationCard`**

In `components/agent/trace/IterationCard.tsx`, add the import:
```tsx
import type { EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
```
Add `verdictsByEvidenceId` to the props type and destructure:
```tsx
  evidence,
  sourcesById,
  verdictsByEvidenceId,
}: {
  iteration: AgentRunIteration;
  active: boolean;
  index: number;
  evidence: Evidence[];
  sourcesById: Map<string, Source>;
  verdictsByEvidenceId: Map<string, EvidenceVerdict[]>;
}) {
```
Update the `EvidenceCard` render:
```tsx
      {evidence.map((ev) => (
        <EvidenceCard
          key={ev.id}
          ev={ev}
          domain={sourcesById.get(ev.sourceId)?.domain ?? "source"}
          verdicts={verdictsByEvidenceId.get(ev.id) ?? []}
        />
      ))}
```

- [ ] **Step 3: Render verdicts in `EvidenceCard`**

Replace `components/agent/trace/EvidenceCard.tsx` entirely:
```tsx
import type { Evidence } from "@/lib/db/schema";
import type { EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
import { formatHealthScore } from "@/lib/health/display";

const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;

export function EvidenceCard({
  ev,
  domain,
  verdicts,
}: {
  ev: Evidence;
  domain: string;
  verdicts: EvidenceVerdict[];
}) {
  return (
    <div className="my-2.5 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5">
      <div className="text-[11px] text-zinc-400">
        <span className="font-mono">{domain}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{ev.extractedText}</p>
      {verdicts.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-zinc-100 pt-2.5">
          {verdicts.map((v) => {
            const style = v.impact ? IMPACT_STYLE[v.impact] : null;
            return (
              <details key={v.claimNumber} className="group text-[11px]">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-zinc-500 marker:content-none">
                  <span className="font-semibold uppercase tracking-wide text-zinc-400">claim {v.claimNumber}</span>
                  {style ? (
                    <>
                      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                      <span className={`font-medium ${style.text}`}>{style.label}</span>
                      {v.confidence !== null && (
                        <span className="font-mono tabular-nums text-zinc-400">{formatHealthScore(v.confidence)}</span>
                      )}
                    </>
                  ) : (
                    <span className="italic text-zinc-400">not evaluated</span>
                  )}
                </summary>
                {v.reasoning && (
                  <p className="mt-1 pl-1 leading-relaxed text-zinc-500">{v.reasoning}</p>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

> Note on the confidence display: `formatHealthScore` renders confidence in 0..1 as `+0.80`. That reads fine as a magnitude here; if the design pass wants a bare `0.80` instead, change to `v.confidence.toFixed(2)` in Task 10. Don't block on it now.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Manual check**

Open a completed run's trace page. Expected: each evidence card lists its tagged claims with a color-coded impact dot + label; clicking a row expands the evaluator's reasoning.

- [ ] **Step 6: Commit** (after approval)

```bash
git add app/\(app\)/theses/\[thesisId\]/runs/\[runId\]/page.tsx components/agent/trace/IterationCard.tsx components/agent/trace/EvidenceCard.tsx
git commit -m "feat: show evaluator verdicts on trace evidence cards"
```

---

## Task 9: Thesis health chart + summary on the detail page

`HealthChart` is the wow surface for this phase — an overall-score line over `recordedAt`. Fewer than 2 snapshots → a placeholder (a single point isn't a trend). A thesis-level summary bar sits above the chart, computed from the loaded claims (no extra query).

**Files:**
- Create: `components/theses/HealthChart.tsx`
- Modify: `app/(app)/theses/[thesisId]/page.tsx`

> **Engage the frontend-design skill** — the chart needs width and should feel considered (restrained axis/grid, accent-colored line, smooth mount). Place it in the main column below `ClaimList`, not the 280px rail.

- [ ] **Step 1: Implement the chart component**

`components/theses/HealthChart.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export type HealthPoint = { recordedAt: string; score: number };

export function HealthChart({ points }: { points: HealthPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
        Run analysis over time to see the trend
      </div>
    );
  }
  const data = points.map((p) => ({
    label: new Date(p.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: p.score,
  }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <ReferenceLine y={0} stroke="#e4e4e7" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, 0, 1]}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }}
            formatter={(v: number) => [v.toFixed(2), "Health"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#1E3A5F"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#1E3A5F" }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Wire the chart + summary into the detail page**

In `app/(app)/theses/[thesisId]/page.tsx`, add imports:
```tsx
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { HealthChart } from "@/components/theses/HealthChart";
import { HealthBar } from "@/components/agent/HealthBar";
import { thesisHealth } from "@/lib/health/score";
```
After the `runs` load (line 25-26), add:
```tsx
  const snapshots = await listSnapshotsForThesis(thesis.id);
  const chartPoints = snapshots
    .map((s) => ({ recordedAt: s.recordedAt.toISOString(), score: Number(s.overallScore) }))
    .reverse(); // listSnapshotsForThesis is newest-first; chart wants oldest→newest

  // Thesis-level current health: mean of the claims' scores, shown only once any
  // claim has been analyzed (matches the unanalyzed placeholder convention).
  const analyzed = thesis.claims.some((c) => c.currentHealthUpdatedAt !== null);
  const thesisScore = thesisHealth(thesis.claims.map((c) => Number(c.currentHealthScore)));
```
In the main column, after `<ClaimList .../>` (line 53), add the summary + chart:
```tsx
        <div>
          <ClaimList thesisId={thesis.id} claims={thesis.claims} />

          <div className="mt-10 border-t border-zinc-100 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Thesis health</p>
              <HealthBar score={thesisScore} analyzed={analyzed} trackClassName="w-28" />
            </div>
            <HealthChart points={chartPoints} />
          </div>
        </div>
```
> This wraps the existing `<ClaimList />` in a `<div>` so the summary + chart share the main grid cell. Make sure the wrapping `<div>` replaces the bare `<ClaimList .../>` as the first child of the `grid` (the second child — the 280px rail — is unchanged).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Manual check**

Open a thesis with ≥2 evaluated runs → line chart renders oldest→newest, y-axis −1..1, zero reference line, accent-blue line. A thesis with <2 snapshots → the placeholder. Thesis-health summary bar reads the mean of claim scores (or "Not analyzed").

- [ ] **Step 5: Commit** (after approval)

```bash
git add components/theses/HealthChart.tsx app/\(app\)/theses/\[thesisId\]/page.tsx
git commit -m "feat: add thesis health summary and over-time chart to the detail page"
```

---

## Task 10: Design pass + DESIGN.md

**Files:**
- Modify: any 4b component as the design pass dictates
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Re-engage the frontend-design skill and review each new/changed surface**

Open `/theses` (list rows), a thesis detail page (claim bars, thesis summary, chart), and a completed run's trace (verdict cards). For each, ask: "Would this be at home inside Linear's product?" Tighten spacing, weight, color, and motion as needed. Decide the `EvidenceCard` confidence display (`+0.80` vs bare `0.80`) noted in Task 8.

- [ ] **Step 2: Run the full suite + typecheck + lint**

Run: `nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint`
Expected: all pass / clean.

- [ ] **Step 3: Record decisions in `docs/DESIGN.md`**

Append a Phase 4b block under the screen-notes section covering: the `HealthBar` design (centered −1..1 fill, ±0.15 deadband for neutral zinc, mono signed value, dashed "Not analyzed" for the unanalyzed state — never a fabricated `0.00`); the trace verdict tags (impact dot + label, expandable reasoning via `<details>`); and the `HealthChart` (accent-blue line, −1..1 domain, zero reference line, <2-snapshot placeholder). Add matching one-line entries to the decisions log with the date 2026-06-14.

- [ ] **Step 4: Commit** (after approval)

```bash
git add docs/DESIGN.md <any-component-files-touched-in-the-pass>
git commit -m "docs: record Phase 4b health-UI design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage (spec §7 + §8):**
- `HealthBar` reusable, analyzed/unanalyzed states → Tasks 2–3. ✓
- `ClaimList` per-claim bars gated on `currentHealthUpdatedAt` → Task 6. ✓
- Thesis list-view health + analyzed signal in the query → Tasks 4–5. ✓
- Trace `EvidenceCard` verdicts (impact/confidence/reasoning), ordinal→claimId mapping, `listLinksForEvidenceIds` → Tasks 7–8. ✓
- `HealthChart` (Recharts, overall line, <2-snapshot placeholder) → Tasks 1, 9. ✓
- Unanalyzed = dashed "Not analyzed", never fabricated `0.00` (spec §8 amendment) → Tasks 3, 4, 5, 6, 9. ✓
- Design pass + DESIGN.md → Task 10. ✓
- Per-claim chart lines correctly **out of scope** (deferred per spec). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete, correct code with real import paths. The only deferred micro-decision (confidence display format in `EvidenceCard`) is explicitly punted to the Task 10 design pass with a working default in place.

**Type consistency:** `EvidenceVerdict` defined in Task 7, consumed identically in Tasks 8 (page, `IterationCard`, `EvidenceCard`). `ThesisListItem.avgHealth`/`healthUpdatedAt` defined in Task 4, consumed in Task 5. `HealthBar` props (`score`/`analyzed`/`trackClassName`) consistent across Tasks 3, 5, 6, 9. `HealthPoint` defined and used in Task 9. `healthTone`/`formatHealthScore`/`healthBarFill` defined in Task 2, consumed in Tasks 3, 8. Numeric↔string conversions (`currentHealthScore`, `confidence`, `overallScore`, `avgHealth`) handled with `Number()` at every boundary.
```
