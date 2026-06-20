# Phase 6c — Landing Polish + Product Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the landing hero and add a real product showcase — the app's own presentational components inside a clickable browser frame — so the page reads as a senior portfolio piece and drives "Try the demo".

**Architecture:** The landing page (`app/page.tsx`) stays a **static Server Component — no DB, no auth**. A new `BrowserFrame` (server, `Link`+chrome) wraps two showcases built from the real pure components (`HealthBar`, `HealthChart`, `CategoryBadge`) and a faithful `ShowcaseTrace` (rebuilt with the trace's own visual tokens, since `IterationCard`/`EvidenceCard` require full DB-row types). All showcase data is in-file typed constants. A tiny client `Reveal` adds one `whileInView` motion moment to the below-fold frame. Both frames link to `/demo`.

**Tech Stack:** Next.js 16 (Server Components + a minimal client island), TypeScript (strict), Tailwind v4, Motion (`motion/react`), existing pure components.

**Conventions (from CLAUDE.md):** Server Components by default; `"use client"` only where genuinely needed (the `Reveal` motion wrapper); absolute `@/` imports; no `any` (use minimal local view types, not faked `$inferSelect` rows); engage frontend-design per surface + a design pass; `npm run typecheck` + `npm run lint` before every commit; UI tests deferred (typecheck/lint + manual); explicit human approval before every `git add`/`git commit` — each task ends with a commit step: pause, summarize, show the diff, wait.

---

## File Structure

**Create:**
- `components/landing/showcase-data.ts` — typed static constants for both frames.
- `components/landing/BrowserFrame.tsx` — server: chrome + `Link href="/demo"` wrapper.
- `components/landing/Reveal.tsx` — client: Motion `whileInView` reveal wrapper.
- `components/landing/ShowcaseDashboard.tsx` — server: dashboard mock from real components.
- `components/landing/ShowcaseTrace.tsx` — server: faithful trace mock (same visual tokens).

**Modify:**
- `app/page.tsx` — refined hero (right card → dashboard frame), new showcase section, `ClaimPreview` removed, light how-it-works touch-up.
- `docs/DESIGN.md` — screen notes + decisions log.

---

## Task 1: Showcase data constants

**Files:** Create `components/landing/showcase-data.ts`.

- [ ] **Step 1: Implement** — typed constants the frames consume. Mirrors the seeded NVDA demo (declining-then-recovering trend, one weakening claim) so the showcase matches what `/demo` actually shows.

```ts
import type { ClaimCategory } from "@/schemas/thesis";
import type { EvidenceImpact } from "@/schemas/evidence";
import type { HealthPoint } from "@/components/theses/HealthChart";

export type ShowcaseClaim = { category: ClaimCategory; statement: string; score: number };

export const DASHBOARD_SHOWCASE = {
  title: "Long NVDA — durable AI data-center demand",
  ticker: "NVDA",
  direction: "LONG",
  horizon: "6–12 mo",
  overallScore: 0.34,
  claims: [
    { category: "financial_performance", statement: "Data-center revenue keeps growing >40% YoY", score: 0.72 },
    { category: "competitive_position", statement: "NVIDIA keeps its lead over competing AI accelerators", score: 0.18 },
    { category: "macro_environment", statement: "Hyperscaler AI capex stays elevated through the period", score: -0.46 },
  ] satisfies ShowcaseClaim[],
  trend: [
    { recordedAt: "2026-05-30", score: 0.55 },
    { recordedAt: "2026-06-06", score: 0.4 },
    { recordedAt: "2026-06-13", score: 0.2 },
    { recordedAt: "2026-06-20", score: 0.34 },
  ] satisfies HealthPoint[],
} as const;

export type ShowcaseVerdict = { claimNumber: number; impact: EvidenceImpact; confidence: number };

export const TRACE_SHOWCASE = {
  reasoning:
    "Starting with the strongest claim — data-center revenue growth. I'll search recent earnings coverage and the latest 10-Q before weighing the competitive and macro signals.",
  toolCall: { name: "web_search", query: "NVIDIA data-center revenue Q3 year over year" },
  evidence: {
    domain: "reuters.com",
    text: "Nvidia reported data-center revenue rose 41% year over year in Q3, ahead of analyst estimates.",
    verdicts: [
      { claimNumber: 1, impact: "strengthens", confidence: 0.8 },
      { claimNumber: 3, impact: "weakens", confidence: 0.6 },
    ] satisfies ShowcaseVerdict[],
  },
} as const;
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean. (Confirms `ClaimCategory` values, `HealthPoint` shape, and `EvidenceImpact` all match.)
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/landing/showcase-data.ts
git commit -m "feat: add landing showcase data constants"
```

---

## Task 2: BrowserFrame + Reveal primitives

**Files:** Create `components/landing/BrowserFrame.tsx`, `components/landing/Reveal.tsx`.

> **Engage the frontend-design skill** — the frame chrome is calm and credible (Linear/Vercel product-shot language); the reveal is a single subtle moment.

- [ ] **Step 1: BrowserFrame (server component)** — `Link` works in Server Components, so no `"use client"`. Shadow mirrors the existing hero card.

```tsx
import Link from "next/link";

export function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <Link
      href="/demo"
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_44px_-18px_rgba(0,0,0,0.2)]"
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
        </span>
        <span className="ml-1.5 flex-1 truncate rounded-md bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-400 ring-1 ring-zinc-200/70">
          {url}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-300 transition-colors group-hover:text-primary sm:inline">
          Open demo →
        </span>
      </div>
      <div className="p-5">{children}</div>
    </Link>
  );
}
```

- [ ] **Step 2: Reveal (client component)** — one `whileInView` moment for below-fold frames.

```tsx
"use client";

import { motion } from "motion/react";

export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add components/landing/BrowserFrame.tsx components/landing/Reveal.tsx
git commit -m "feat: add landing BrowserFrame and Reveal primitives"
```

---

## Task 3: ShowcaseDashboard

**Files:** Create `components/landing/ShowcaseDashboard.tsx`.

Reuses the real `HealthBar`, `HealthChart`, `CategoryBadge` with the Task 1 constants. Server component (the client `HealthChart` is a nested island).

> **Engage the frontend-design skill** — this should read as the real `/demo` dashboard at preview density.

- [ ] **Step 1: Implement**

```tsx
import { HealthBar } from "@/components/agent/HealthBar";
import { HealthChart } from "@/components/theses/HealthChart";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { DASHBOARD_SHOWCASE } from "./showcase-data";

export function ShowcaseDashboard() {
  const d = DASHBOARD_SHOWCASE;
  return (
    <div className="text-left">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
          {d.ticker} · {d.direction}
        </span>
        <span className="font-mono text-xs text-zinc-400">{d.horizon}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-900">{d.title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400">Overall health</span>
        <HealthBar score={d.overallScore} analyzed trackClassName="w-24" />
      </div>

      <div className="mt-4 space-y-3">
        {d.claims.map((c) => (
          <div key={c.statement}>
            <div className="flex items-center justify-between gap-2">
              <CategoryBadge category={c.category} />
              <HealthBar score={c.score} analyzed trackClassName="w-16" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{c.statement}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <HealthChart points={d.trend} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean. (Confirms `HealthBar` accepts `analyzed` as a boolean literal and `score: number`; `CategoryBadge` accepts the literal categories; `HealthChart` accepts `points`.)
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/landing/ShowcaseDashboard.tsx
git commit -m "feat: add landing dashboard showcase"
```

---

## Task 4: ShowcaseTrace

**Files:** Create `components/landing/ShowcaseTrace.tsx`.

A faithful static rebuild of one trace iteration using the **same visual tokens** as `components/agent/trace/EvidenceCard.tsx` (numbered spine, reasoning, tool-call chip, evidence card with `border-l-health-strong`, verdict dots + confidence). Rebuilt rather than reusing `IterationCard`/`EvidenceCard` because those require full DB-row types (`AgentRunIteration`, `Evidence`) that would be brittle to fake. Server component.

> **Engage the frontend-design skill** — match the real trace's look; this is the differentiation surface.

- [ ] **Step 1: Implement**

```tsx
import { TRACE_SHOWCASE } from "./showcase-data";

const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;

export function ShowcaseTrace() {
  const t = TRACE_SHOWCASE;
  return (
    <div className="relative pl-[26px] text-left">
      <span className="absolute bottom-2 left-[7px] top-1.5 w-0.5 bg-zinc-200" aria-hidden />
      <span className="absolute left-0 top-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
        1
      </span>

      <p className="text-sm leading-relaxed text-zinc-700">{t.reasoning}</p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px]">
        <span className="font-semibold text-zinc-700">{t.toolCall.name}</span>
        <span className="text-zinc-400">{t.toolCall.query}</span>
      </div>

      <div className="my-3 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5">
        <div className="font-mono text-[11px] text-zinc-400">{t.evidence.domain}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{t.evidence.text}</p>
        <div className="mt-2.5 flex flex-col gap-1 border-t border-zinc-100 pt-2">
          {t.evidence.verdicts.map((v) => {
            const s = IMPACT_STYLE[v.impact];
            return (
              <div key={v.claimNumber} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-zinc-400">claim {v.claimNumber}</span>
                <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
                <span className={`font-medium ${s.text}`}>{s.label}</span>
                <span className="font-mono tabular-nums text-zinc-400">{v.confidence.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/landing/ShowcaseTrace.tsx
git commit -m "feat: add landing agent-trace showcase"
```

---

## Task 5: Wire into the landing page

**Files:** Modify `app/page.tsx`.

Replace the hand-built hero preview card with the dashboard frame, add the "Watch the agent think" showcase section with the trace frame, remove `ClaimPreview`, and lightly tighten the how-it-works strip. The page stays a Server Component (no `"use client"`).

> **Engage the frontend-design skill** — refine hero rhythm/spacing; the demo must read as the real product.

- [ ] **Step 1: Add imports** — at the top of `app/page.tsx`, after the existing `import { Button } from "@/components/ui/button";` line, add:
```tsx
import { BrowserFrame } from "@/components/landing/BrowserFrame";
import { Reveal } from "@/components/landing/Reveal";
import { ShowcaseDashboard } from "@/components/landing/ShowcaseDashboard";
import { ShowcaseTrace } from "@/components/landing/ShowcaseTrace";
```

- [ ] **Step 2: Replace the hero preview card** — swap the entire right-column card (the `<div>` that starts with `className="animate-rise rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 shadow-..."` and contains the `ClaimPreview` calls) for the dashboard frame. Replace that whole `<div>...</div>` block with:
```tsx
          <div className="animate-rise" style={{ animationDelay: "240ms" }}>
            <BrowserFrame url="thesistracker.app/demo">
              <ShowcaseDashboard />
            </BrowserFrame>
          </div>
```

- [ ] **Step 3: Add the showcase section** — between the hero `</section>` and the "how it works" `<section className="border-t border-zinc-100">`, insert:
```tsx
        <section className="border-t border-zinc-100">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">
                Watch the agent think
              </span>
              <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight">
                Every verdict shows its work.
              </h2>
              <p className="mt-4 max-w-[42ch] leading-relaxed text-zinc-600">
                The agent plans, searches, reads the source, and evaluates each
                finding against your claims — and you see the whole trail: the
                reasoning, the tool calls, the evidence, and how it scored.
              </p>
            </div>
            <Reveal>
              <BrowserFrame url="thesistracker.app/demo">
                <ShowcaseTrace />
              </BrowserFrame>
            </Reveal>
          </div>
        </section>
```

- [ ] **Step 4: Remove `ClaimPreview`** — delete the `function ClaimPreview({ ... }) { ... }` declaration at the bottom of the file (it is now unused). Lint will flag it as unused if left.

- [ ] **Step 5: Typecheck + lint** — `npm run typecheck && npm run lint` → clean (no unused `ClaimPreview`).
- [ ] **Step 6: Manual check** — `npm run dev`, open `/` (signed out): refined hero with a browser-framed dashboard (header, 3 claim health bars, trend chart); a "Watch the agent think" section with the framed trace (reasoning → tool chip → evidence + strengthens/weakens verdicts); the how-it-works strip below. Clicking either frame → `/demo`. Resize narrow → no horizontal overflow. Confirm the signed-in nav still swaps to "Go to dashboard".
- [ ] **Step 7: Commit** (after approval)
```bash
git add app/page.tsx
git commit -m "feat: refine landing hero and add product showcase"
```

---

## Task 6: Gates + design pass + DESIGN.md

**Files:** Modify any 6c surface as the pass dictates; `docs/DESIGN.md`.

- [ ] **Step 1: Full gates** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint` → all pass / clean.
- [ ] **Step 2: Design pass** — re-engage frontend-design on the hero, the two frames, and the showcase section (Linear/Vercel/Granola bar). Check: type hierarchy and spacing rhythm; the dashboard frame reads as the real product at preview density; the trace frame matches the real trace tokens; the chart height sits well inside the hero card (tighten only if it dominates); both frames crisp and clickable; no narrow-width overflow. Tighten only what clearly needs it; document any markup change.
- [ ] **Step 3: Record in `docs/DESIGN.md`** — append a "Landing polish (Phase 6c)" screen-notes block under `## Per-screen decisions` (before `---`/`## Decisions log`): the refined hero with a browser-framed live dashboard (real `HealthBar`/`HealthChart`/`CategoryBadge`, not a screenshot); the "Watch the agent think" showcase with a faithful `ShowcaseTrace` rebuilt from the trace's own tokens; `BrowserFrame` chrome + both frames linking to `/demo`; the static-page/no-DB constraint; the single `Reveal` `whileInView` moment below the fold. Add dated decisions-log entries (2026-06-20): (a) product showcase = live prop-driven components in a `BrowserFrame`, kept DB-free on a static Server Component, not screenshots; (b) the trace frame is a faithful **rebuild** (`ShowcaseTrace`) using the trace's visual tokens, because `IterationCard`/`EvidenceCard` need full DB-row types.
- [ ] **Step 4: Commit** (after approval)
```bash
git add docs/DESIGN.md <any-touched-files>
git commit -m "docs: record Phase 6c landing-polish design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Refined hero + kept CTAs → Task 5 (Step 2 + hero rhythm in the design pass, Task 6). ✓
- Product showcase = live components in a browser frame → Tasks 2–5. ✓
- "Watch the agent think" trace section → Tasks 4, 5. ✓
- How-it-works kept with light touch-up → Task 5 (design pass, Task 6). ✓
- `BrowserFrame` links to `/demo`, chrome + URL pill → Task 2. ✓
- Static Server Component, no DB/auth, in-file typed constants → Task 1 (constants), Task 5 (page stays server). ✓
- Trace reuse-vs-rebuild decision **made**: faithful rebuild (`ShowcaseTrace`) → Task 4; recorded in DESIGN.md → Task 6. ✓
- One tasteful `whileInView` motion moment → Task 2 (`Reveal`), Task 5 (below-fold frame). ✓
- Out of scope (OG/favicon/README/video/deploy = 6e; formal mobile/a11y audit = 6d) correctly excluded; new sections built responsive. ✓
- Testing = typecheck/lint + manual; no faked unit tests → Tasks 1–6. ✓
- Design pass + DESIGN.md → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete, final code. The one design fork in the spec (trace reuse vs rebuild) is resolved here as a rebuild.

**Type consistency:** `ShowcaseClaim`/`ShowcaseVerdict` (Task 1) feed `ShowcaseDashboard` (Task 3) and `ShowcaseTrace` (Task 4). `DASHBOARD_SHOWCASE.trend` typed `HealthPoint[]` matches `HealthChart`'s `points` prop. `HealthBar` called with `score: number` + `analyzed` boolean + `trackClassName` — matches its Phase 4b signature. `CategoryBadge` takes `category: ClaimCategory` — the literal category strings are validated by the `satisfies ShowcaseClaim[]` in Task 1. `IMPACT_STYLE` keys (`strengthens`/`neutral`/`weakens`) match `EvidenceImpact`. `BrowserFrame` (`url`, `children`) and `Reveal` (`children`, `className?`) consumed exactly as defined, in Task 5.
