# Phase 6d — Cross-cutting Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen work on a phone, load gracefully (skeletons), and degrade calmly (branded error/404, a no-evidence empty state), with a targeted accessibility pass.

**Architecture:** Additive UI hardening — no new product features, no DB/schema changes. Add Tailwind responsive prefixes (mobile-first: base stacked, `lg:` desktop), Next.js App Router `loading.tsx`/`error.tsx`/`not-found.tsx` files, one new `AgentRunPanel`/trace empty state, and focus-visible/aria touches on custom controls.

**Tech Stack:** Next.js 16 (App Router Suspense + error boundaries), TypeScript (strict), Tailwind v4, existing components.

**Conventions (from CLAUDE.md):** Server Components by default (`error.tsx` must be a client component per Next); `"use client"` only where required; absolute `@/` imports; no `any`; skeletons not spinners; engage frontend-design + a design pass; `npm run typecheck` + `npm run lint` before every commit; tests need Node 22; UI tests deferred (typecheck/lint + manual); explicit human approval before every `git add`/`git commit` — each task ends with a commit step: pause, summarize, show the diff, wait.

**Already handled (verified — do NOT rebuild):** 0-theses empty state; failed-run error surfacing (trace + `AgentRunPanel`, gated `status === "failed" && error`); drafter 0-claims message; "Not analyzed" health placeholder.

---

## File Structure

**Create:**
- `components/ui/skeleton.tsx` — shared pulse block.
- `app/(app)/theses/loading.tsx`, `app/(app)/theses/[thesisId]/loading.tsx`, `app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx` — route skeletons.
- `app/(app)/error.tsx` — branded client error boundary.
- `app/not-found.tsx` — branded 404.

**Modify:**
- `app/(app)/theses/[thesisId]/page.tsx`, `app/demo/page.tsx` — responsive grid.
- `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx` — no-evidence empty state (+ responsive verify).
- `components/agent/AgentRunPanel.tsx` — no-evidence empty state.
- `components/landing/BrowserFrame.tsx`, `components/settings/DigestToggle.tsx`, `components/theses/NewThesisWizard.tsx` — focus-visible.
- `docs/DESIGN.md` — screen notes + decisions log.

---

## Task 1: Skeleton primitive + route loading states

**Files:** Create `components/ui/skeleton.tsx`, `app/(app)/theses/loading.tsx`, `app/(app)/theses/[thesisId]/loading.tsx`, `app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx`.

- [ ] **Step 1: Skeleton primitive** — `components/ui/skeleton.tsx` (`cn` is exported from `@/lib/utils`):
```tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-100", className)} />;
}
```

- [ ] **Step 2: Theses list skeleton** — `app/(app)/theses/loading.tsx` (matches the list header + 4 `ThesisRow`-shaped rows):
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-8 border-t border-zinc-200">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-zinc-100 px-2 py-4"
          >
            <div>
              <Skeleton className="h-4 w-64" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
            <Skeleton className="h-1.5 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Thesis detail skeleton** — `app/(app)/theses/[thesisId]/loading.tsx` (matches the responsive two-column layout from Task 3):
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <div className="mt-3.5">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
          <Skeleton className="mt-6 h-40 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Trace skeleton** — `app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-16 w-full rounded-xl" />
      <div className="mt-6 space-y-4 pl-[30px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 6: Manual check** — with the dev server running, throttle the network (or it's enough to confirm the files compile and render); navigating to `/theses`, a thesis, and a run should briefly show the matching skeleton on a cold load.
- [ ] **Step 7: Commit** (after approval)
```bash
git add components/ui/skeleton.tsx "app/(app)/theses/loading.tsx" "app/(app)/theses/[thesisId]/loading.tsx" "app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx"
git commit -m "feat: add route loading skeletons"
```

---

## Task 2: Branded error & not-found boundaries

**Files:** Create `app/(app)/error.tsx`, `app/not-found.tsx`.

- [ ] **Step 1: App error boundary** — `app/(app)/error.tsx` MUST be a client component and receives `error` + `reset`. We render only static UI + `reset()` (never log/print `error`, to avoid leaking internals); `error` stays in the prop type but is not destructured, so there's no unused-var lint error:
```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
        <span className="size-4 rounded-[4px] bg-[#C0492F]/15 ring-1 ring-inset ring-[#C0492F]/30" />
      </div>
      <p className="mt-5 font-medium text-zinc-900">Something went wrong</p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
        That page hit an unexpected error. You can try again, or head back to your theses.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/theses">Back to theses</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Branded 404** — `app/not-found.tsx` (root; rendered inside the root layout, so it gets fonts/ClerkProvider). It is a Server Component:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">404</span>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">Page not found</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean (confirm no unused `error`).
- [ ] **Step 4: Manual check** — visit `/demo/runs/00000000-0000-0000-0000-000000000000` (a non-demo run id) → the branded 404 renders (the scope guard calls `notFound()`). For the error boundary: temporarily `throw new Error("test")` at the top of a thesis page body, load it, confirm the branded "Something went wrong" with a working "Try again", then remove the throw.
- [ ] **Step 5: Commit** (after approval)
```bash
git add "app/(app)/error.tsx" app/not-found.tsx
git commit -m "feat: add branded error boundary and 404 page"
```

---

## Task 3: Responsive app + demo grids

**Files:** Modify `app/(app)/theses/[thesisId]/page.tsx`, `app/demo/page.tsx`.

Both use a hard `grid-cols-[1fr_280px]` that overflows on phones. Make them mobile-first (stacked base, two-column at `lg`).

- [ ] **Step 1: Thesis detail grid** — in `app/(app)/theses/[thesisId]/page.tsx`, change the line:
```tsx
      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
```
to:
```tsx
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
```

- [ ] **Step 2: Demo dashboard grid** — in `app/demo/page.tsx`, change the line:
```tsx
      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
```
to:
```tsx
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Manual check** — at a ~375px viewport, `/theses/<id>` and `/demo` stack to a single column (claims, then the rail) with no horizontal scroll; at ≥1024px they keep the current two-column layout.
- [ ] **Step 5: Commit** (after approval)
```bash
git add "app/(app)/theses/[thesisId]/page.tsx" app/demo/page.tsx
git commit -m "fix: make thesis detail and demo dashboard responsive"
```

---

## Task 4: Mobile sweep of the remaining surfaces

**Files:** Modify only what overflows — candidates: `app/(app)/layout.tsx`, `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, `app/demo/runs/[runId]/page.tsx`, `components/theses/NewThesisWizard.tsx`, `app/(app)/settings/page.tsx`.

This is a guided verify-and-fix at a ~375px viewport. For each surface below, load it narrow and check for horizontal overflow / clipped content. The remedy pattern when something overflows: convert the offending fixed multi-column grid or fixed width to **mobile-first** (base stacked / `flex-wrap` / smaller padding, `lg:`/`md:` restoring the desktop layout). Do **not** change desktop rendering.

- [ ] **Step 1: Header** (`app/(app)/layout.tsx`) — the `flex items-center justify-between ... px-6` header with wordmark + settings gear + `UserButton`. Confirm it fits at 375px; if the wordmark text crowds, that's acceptable (it's short). Expected: no change needed — verify only.
- [ ] **Step 2: Trace pages** (`app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, `app/demo/runs/[runId]/page.tsx`) — `max-w-3xl` with a `pl-[30px]` timeline. Confirm iteration/evidence cards and long tokens (URLs, mono text) wrap without overflow. If a long unbroken string overflows, add `break-words` to the affected text container. The app trace gets `px-6` from the `(app)` layout; the demo trace already has `px-6`.
- [ ] **Step 3: New-thesis wizard** (`components/theses/NewThesisWizard.tsx`) — already `mx-auto max-w-xl` with `inline-flex` segmented controls and `flex justify-between` button rows. Confirm at 375px the segmented controls and claim cards don't overflow; if a segmented control's labels are too wide, allow it to wrap or shrink (`flex-wrap` / `text-xs`). Expected: minor or no change.
- [ ] **Step 4: Settings** (`app/(app)/settings/page.tsx`) — `max-w-2xl` single column; the label/description-left, control-right rows. Confirm rows don't overflow at 375px. Expected: verify only.
- [ ] **Step 5: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 6: Commit** (after approval) — if any files changed:
```bash
git add -A
git commit -m "fix: mobile reflow for trace, wizard, and app chrome"
```
If nothing needed changing, report that the sweep found no overflow and skip the commit (note it for the controller).

---

## Task 5: No-new-evidence empty state + accessibility touches

**Files:** Modify `components/agent/AgentRunPanel.tsx`, `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, `components/landing/BrowserFrame.tsx`, `components/settings/DigestToggle.tsx`, `components/theses/NewThesisWizard.tsx`.

### Empty state: a completed run that found nothing

- [ ] **Step 1: AgentRunPanel** — in `components/agent/AgentRunPanel.tsx`, the latest-run `<Link>` currently shows the failed error line. Directly after that `{latest.status === "failed" && latest.error && (...)}` block, add a calm no-evidence line (`isTerminalStatus` is already imported):
```tsx
        {isTerminalStatus(latest.status) && latest.status !== "failed" && latest.evidenceCollected === 0 && (
          <p className="mt-1 text-[11px] text-zinc-400">No new evidence this run</p>
        )}
```

- [ ] **Step 2: Trace page** — in `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, the timeline `<div className="relative mt-6 pl-[30px]">...</div>` ends with the `{iterations.length === 0 && ...}` line. Immediately after that timeline `</div>` (still inside the outer page `<div>`), add:
```tsx
      {isTerminalStatus(run.status) && run.status !== "failed" && run.evidenceCollected === 0 && (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          This run finished without finding new evidence.
        </p>
      )}
```
(`isTerminalStatus` and `run.evidenceCollected` are already available on the page.)

### Accessibility: focus-visible on custom controls

- [ ] **Step 3: BrowserFrame focus ring** — in `components/landing/BrowserFrame.tsx`, the `<Link href="/demo" className="group block overflow-hidden rounded-xl ...">` — append to that className:
```
 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2
```

- [ ] **Step 4: DigestToggle focus ring** — in `components/settings/DigestToggle.tsx`, the `<button role="switch" ...>` className template literal currently ends `...transition-colors disabled:opacity-50 ${...}`. Add to the static part of that className:
```
 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2
```

- [ ] **Step 5: Wizard segmented controls focus ring** — in `components/theses/NewThesisWizard.tsx`, find the two `inline-flex overflow-hidden rounded-lg border border-zinc-200` segmented controls (around the direction toggle and the manual/paragraph toggle). On each inner segment `<button>`, add to its className:
```
 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50
```
(Use `ring-inset` here because the segments sit inside a bordered container.)

- [ ] **Step 6: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 7: Manual check** — a completed run with 0 evidence shows the new lines (trace + panel); tabbing to the landing frame, the digest switch, and the wizard segments shows a visible focus ring; the switch toggles via keyboard (Space/Enter).
- [ ] **Step 8: Commit** (after approval)
```bash
git add components/agent/AgentRunPanel.tsx "app/(app)/theses/[thesisId]/runs/[runId]/page.tsx" components/landing/BrowserFrame.tsx components/settings/DigestToggle.tsx components/theses/NewThesisWizard.tsx
git commit -m "feat: add no-evidence empty state and focus-visible rings"
```

---

## Task 6: Gates + design pass + DESIGN.md

**Files:** Modify any 6d surface as the pass dictates; `docs/DESIGN.md`.

- [ ] **Step 1: Full gates** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint` → all pass / clean.
- [ ] **Step 2: Design pass** — re-engage frontend-design on the skeletons, the error/404 pages, the mobile layouts (375px), and the new empty state (Linear/Vercel/Granola bar — impeccable on mobile). Confirm skeletons match the real layouts, the boundaries read calm-not-alarming, and the contrast spot-check: review `text-zinc-400` muted text on white for the smallest body-relevant text and bump to `text-zinc-500` only where it fails AA (leave deliberately-quiet decorative meta). Document any change.
- [ ] **Step 3: Record in `docs/DESIGN.md`** — append a "Hardening (Phase 6d)" screen-notes block under `## Per-screen decisions` (before `---`/`## Decisions log`): mobile-first responsive strategy (base stacked, `lg:` two-column for detail/demo); skeletons-not-spinners for list/detail/trace via a shared `Skeleton`; branded `app/(app)/error.tsx` (calm "Something went wrong" + retry) and `app/not-found.tsx` (branded 404); the "no new evidence this run" empty state distinct from failed; focus-visible rings on custom controls (frame, switch, segments); the targeted (not exhaustive) a11y scope. Add dated decisions-log entries (2026-06-20): (a) mobile-first responsive (base stacked / `lg:` desktop), desktop rendering unchanged; (b) branded error/404 boundaries that never leak internals; (c) no-new-evidence empty state gated on `terminal && !failed && evidenceCollected === 0`.
- [ ] **Step 4: Commit** (after approval)
```bash
git add docs/DESIGN.md <any-touched-files>
git commit -m "docs: record Phase 6d hardening design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Mobile pass → Task 3 (detail/demo grids, the known overflow culprits) + Task 4 (verify-and-fix sweep of trace/header/wizard/settings). ✓
- Loading skeletons (list/detail/trace, skip settings/new) → Task 1. ✓
- Error & not-found boundaries → Task 2. ✓
- No-new-evidence empty state → Task 5 (Steps 1–2). ✓
- A11y pass (focus-visible on custom controls, aria already present, contrast spot-check) → Task 5 (Steps 3–5) + Task 6 (Step 2 contrast). ✓
- Already-handled states not rebuilt (0-theses, failed-run, drafter-0, Not analyzed) — untouched. ✓
- Design pass + DESIGN.md → Task 6. ✓
- Out of scope (drafter streaming, OG/README/deploy=6e) excluded. ✓

**Placeholder scan:** No TBD/TODO. Tasks 1–3, 5, 6 have complete code. Task 4 is an explicit verify-and-fix sweep with a concrete remedy pattern (mobile-first conversion / `break-words` / `flex-wrap`) and "verify only — expected no change" notes per surface; this is intentional for a responsive audit whose exact edits depend on observed overflow, not a vague placeholder.

**Type consistency:** `Skeleton` (Task 1) `{ className?: string }` reused by every `loading.tsx`. `error.tsx` uses Next's `{ error, reset }` contract (`error` typed, undestructured). The no-evidence guard `isTerminalStatus(x.status) && x.status !== "failed" && x.evidenceCollected === 0` is identical in `AgentRunPanel` (`latest`) and the trace page (`run`); both objects are `AgentRun` with `status` + `evidenceCollected`. Focus-ring utilities are appended to existing classNames, no signature changes. The detail skeleton's `lg:grid-cols-[1fr_280px]` matches the responsive grid Task 3 introduces.
