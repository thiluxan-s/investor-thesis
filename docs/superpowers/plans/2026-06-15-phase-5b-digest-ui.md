# Phase 5b — Digest UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Phase 5a digest backend — a "Last analyzed" timestamp on theses, and a `/settings` page (reached from the header) to toggle the weekly email digest and trigger a run on demand.

**Architecture:** A pure `formatRelativeTime` helper feeds "Last analyzed" labels on the thesis list (via the existing `lastAnalyzedByThesisIds` repo helper as a second query — never a join, which would corrupt the list query's aggregates) and the detail header (derived from already-loaded runs). A new `/settings` Server Component renders a digest on/off toggle (Server Action wrapping `setDigestEnabled`) and a "Run weekly analysis now" button (the existing `triggerWeeklyDigestNow` action). No new backend.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), TypeScript (strict), Tailwind v4, sonner (toasts, already wired), Lucide icons, Vitest (Node 22).

**Conventions (from CLAUDE.md):** Server Components by default, `"use client"` only for interactivity; mutations via Server Actions returning `ActionResult` (`{ ok: true; data } | { ok: false; error }`), never throw across the boundary; numeric/date conversions at boundaries; absolute `@/` imports; engage the frontend-design skill per surface + design pass after; `npm run typecheck` + `npm run lint` before every commit; UI component tests deferred — TDD only the pure helper; tests need Node 22.

**Design language (DESIGN.md):** zinc neutrals, deep-blue `#1E3A5F` accent (`--primary` / `bg-primary`), flat over carded, whitespace over borders, Geist Mono for numeric/data.

**Approval workflow:** explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, wait for approval.

---

## File Structure

**Create:** `lib/format/relative-time.ts` (+ test), `app/(app)/settings/page.tsx`, `app/(app)/settings/actions.ts`, `components/settings/DigestToggle.tsx`, `components/settings/RunAnalysisButton.tsx`.

**Modify:** `app/(app)/theses/page.tsx` (fetch last-analyzed map), `components/theses/ThesisRow.tsx` (show it), `app/(app)/theses/[thesisId]/page.tsx` (detail header last-analyzed), `app/(app)/layout.tsx` (Settings nav link), `docs/DESIGN.md`.

---

## Task 1: `formatRelativeTime` helper (TDD)

**Files:** Create `lib/format/relative-time.ts`, `lib/format/relative-time.test.ts`.

- [ ] **Step 1: Failing test** — `lib/format/relative-time.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe("formatRelativeTime", () => {
  it("returns 'Not analyzed' for null", () => {
    expect(formatRelativeTime(null, now)).toBe("Not analyzed");
  });
  it("returns 'just now' under 45s", () => {
    expect(formatRelativeTime(ago(10 * S), now)).toBe("just now");
  });
  it("buckets minutes, hours, days, weeks", () => {
    expect(formatRelativeTime(ago(5 * M), now)).toBe("5m ago");
    expect(formatRelativeTime(ago(3 * H), now)).toBe("3h ago");
    expect(formatRelativeTime(ago(2 * D), now)).toBe("2d ago");
    expect(formatRelativeTime(ago(10 * D), now)).toBe("1w ago");
  });
  it("rounds down at boundaries", () => {
    expect(formatRelativeTime(ago(90 * M), now)).toBe("1h ago");
  });
});
```

- [ ] **Step 2: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/format/relative-time.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/format/relative-time.ts`:
```ts
// Coarse relative-time label for "Last analyzed". Null -> "Not analyzed".
// Callers that want a verb prefix ("Analyzed 2d ago") add it only when the date
// is non-null, so the null branch reads "Not analyzed" cleanly.
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "Not analyzed";
  const sec = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run lib/format/relative-time.test.ts` → PASS (4 tests).
- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/format/relative-time.ts lib/format/relative-time.test.ts
git commit -m "feat: add coarse relative-time formatter"
```

---

## Task 2: "Last analyzed" on the thesis list

**Files:** Modify `app/(app)/theses/page.tsx`, `components/theses/ThesisRow.tsx`.

> **Engage the frontend-design skill** — the row is a dense data surface; the timestamp goes in the existing meta line, subordinate to the title.

- [ ] **Step 1: Fetch the last-analyzed map in the page** — in `app/(app)/theses/page.tsx`:
  - Add imports:
    ```ts
    import { lastAnalyzedByThesisIds } from "@/lib/db/repositories/agent-runs";
    ```
  - After `const theses = await listThesesByUser(userId);` add:
    ```ts
    const lastAnalyzed = await lastAnalyzedByThesisIds(theses.map((t) => t.id));
    ```
  - Change the row render to pass it:
    ```tsx
    <ThesisRow key={t.id} thesis={t} lastAnalyzed={lastAnalyzed.get(t.id) ?? null} />
    ```

- [ ] **Step 2: Render it in `ThesisRow`** — in `components/theses/ThesisRow.tsx`:
  - Add import: `import { formatRelativeTime } from "@/lib/format/relative-time";`
  - Add the prop to the signature: change `export function ThesisRow({ thesis }: { thesis: ThesisListItem })` to:
    ```tsx
    export function ThesisRow({ thesis, lastAnalyzed }: { thesis: ThesisListItem; lastAnalyzed: Date | null })
    ```
  - In the meta line, append the analyzed label. Replace:
    ```tsx
        <p className="mt-0.5 text-xs text-zinc-400">
          {thesis.claimCount} {thesis.claimCount === 1 ? "claim" : "claims"} ·{" "}
          {HORIZON_LABELS[thesis.timeHorizon]}
        </p>
    ```
    with:
    ```tsx
        <p className="mt-0.5 text-xs text-zinc-400">
          {thesis.claimCount} {thesis.claimCount === 1 ? "claim" : "claims"} ·{" "}
          {HORIZON_LABELS[thesis.timeHorizon]} ·{" "}
          {lastAnalyzed ? `Analyzed ${formatRelativeTime(lastAnalyzed)}` : "Not analyzed"}
        </p>
    ```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Manual check** — `/theses`: rows show "Analyzed Nd ago" (or "Not analyzed"); the health bar/status columns are unchanged.
- [ ] **Step 5: Commit** (after approval)
```bash
git add app/\(app\)/theses/page.tsx components/theses/ThesisRow.tsx
git commit -m "feat: show last-analyzed time on thesis list rows"
```

---

## Task 3: "Last analyzed" on the detail header

**Files:** Modify `app/(app)/theses/[thesisId]/page.tsx`.

The detail page already loads `runs` (`listAgentRunsForThesis`) and imports `isTerminalStatus`. Derive the most recent terminal run's `completedAt` (robust to list ordering) and show it in the header meta line beside the ticker/direction/horizon badges.

- [ ] **Step 1: Derive last-analyzed** — add the import `import { formatRelativeTime } from "@/lib/format/relative-time";`. After the `activeRun` line, add:
```ts
  // Most recent completed run, regardless of the list's ordering.
  const lastAnalyzed = runs
    .filter((r) => isTerminalStatus(r.status) && r.completedAt)
    .reduce<Date | null>((acc, r) => {
      const c = r.completedAt as Date;
      return !acc || c > acc ? c : acc;
    }, null);
```

- [ ] **Step 2: Render it** — in the header meta `<div className="mt-2 flex flex-wrap items-center gap-2">` (the one with the ticker pill + direction + horizon), append after the horizon span:
```tsx
            <span className="text-xs text-zinc-400">
              · {lastAnalyzed ? `Analyzed ${formatRelativeTime(lastAnalyzed)}` : "Not analyzed"}
            </span>
```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Manual check** — a thesis detail page shows "Analyzed Nd ago" in the header; an unanalyzed thesis shows "Not analyzed".
- [ ] **Step 5: Commit** (after approval)
```bash
git add app/\(app\)/theses/\[thesisId\]/page.tsx
git commit -m "feat: show last-analyzed time on the thesis detail header"
```

---

## Task 4: `setDigestEnabledAction` Server Action

**Files:** Create `app/(app)/settings/actions.ts`.

- [ ] **Step 1: Implement** — `app/(app)/settings/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { setDigestEnabled } from "@/lib/db/repositories/users";
import type { ActionResult } from "@/app/(app)/theses/actions";

export async function setDigestEnabledAction(enabled: boolean): Promise<ActionResult> {
  const userId = await requireUserId();
  await setDigestEnabled(userId, enabled);
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
```
> `ActionResult<T = undefined>` is `{ ok: true; data: T } | { ok: false; error: string }` — the success arm needs `data: undefined`. (Confirm the exact shape in `app/(app)/theses/actions.ts` and match it.)

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add app/\(app\)/settings/actions.ts
git commit -m "feat: add setDigestEnabled server action"
```

---

## Task 5: `DigestToggle` client component

**Files:** Create `components/settings/DigestToggle.tsx`.

An accessible toggle (`role="switch"`, no new dependency) with optimistic state, reverting + toasting on failure.

> **Engage the frontend-design skill** for the switch styling (track + knob, accent when on).

- [ ] **Step 1: Implement** — `components/settings/DigestToggle.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setDigestEnabledAction } from "@/app/(app)/settings/actions";

export function DigestToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setDigestEnabledAction(next);
      if (!res.ok) {
        setEnabled(!next); // revert
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Weekly email digest"
      disabled={pending}
      onClick={toggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? "bg-primary" : "bg-zinc-200"
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/settings/DigestToggle.tsx
git commit -m "feat: add digest on/off toggle component"
```

---

## Task 6: `RunAnalysisButton` client component

**Files:** Create `components/settings/RunAnalysisButton.tsx`.

Mirrors the existing `AnalyzeNowButton` pattern (useTransition + toast).

- [ ] **Step 1: Implement** — `components/settings/RunAnalysisButton.tsx`:
```tsx
"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerWeeklyDigestNow } from "@/app/(app)/theses/agent-actions";

export function RunAnalysisButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await triggerWeeklyDigestNow();
          if (res.ok) toast.success("Analysis queued — your digest emails when the runs finish.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Queuing…" : "Run weekly analysis now"}
    </Button>
  );
}
```
> If the `Button` `cva` has no `outline` variant, use the default variant (check `components/ui/button.tsx`).

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add components/settings/RunAnalysisButton.tsx
git commit -m "feat: add run-weekly-analysis-now button"
```

---

## Task 7: Settings page + header nav link

**Files:** Create `app/(app)/settings/page.tsx`; Modify `app/(app)/layout.tsx`.

> **Engage the frontend-design skill** for the settings layout (sectioned rows, label + description left, control right; flat, hairline separators).

- [ ] **Step 1: Settings page** — `app/(app)/settings/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getUserById } from "@/lib/db/repositories/users";
import { DigestToggle } from "@/components/settings/DigestToggle";
import { RunAnalysisButton } from "@/components/settings/RunAnalysisButton";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await getUserById(userId);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>

      <section className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Notifications</p>
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-zinc-100 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">Weekly email digest</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              A Sunday summary of what changed across your active theses — emailed only when something moved.
            </p>
          </div>
          <DigestToggle initialEnabled={user.digestEnabled} />
        </div>
      </section>

      <section className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis</p>
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-zinc-100 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">Run weekly analysis now</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Analyze all active theses immediately and email your digest when the runs finish.
            </p>
          </div>
          <RunAnalysisButton />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Header nav link** — in `app/(app)/layout.tsx`:
  - Add imports: `import { Settings } from "lucide-react";` (verify `lucide-react` is installed — it ships with the shadcn setup; if absent, use a plain text "Settings" `Link` instead of the icon).
  - Replace the bare `<UserButton />` with a grouped nav:
    ```tsx
            <div className="flex items-center gap-4">
              <Link
                href="/settings"
                aria-label="Settings"
                className="text-zinc-400 transition-colors hover:text-zinc-700"
              >
                <Settings className="size-[18px]" />
              </Link>
              <UserButton />
            </div>
    ```
    (`Link` is already imported in the layout.)

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Manual check** — the header shows a Settings gear → `/settings`; the page shows the digest toggle (reflecting saved state, persists across reload) and the run-now button (toasts "queued").
- [ ] **Step 5: Commit** (after approval)
```bash
git add app/\(app\)/settings/page.tsx app/\(app\)/layout.tsx
git commit -m "feat: add settings page with digest toggle and run-now, plus nav link"
```

---

## Task 8: Design pass + `DESIGN.md`

**Files:** Modify any 5b surface as the pass dictates; `docs/DESIGN.md`.

- [ ] **Step 1: Re-engage frontend-design** — review the settings page, the header nav gear, the list-row meta line, and the detail header. Tighten spacing/weight/color to the Linear-grade bar. Confirm the toggle reads as a switch and the run-now button sits right in the settings rhythm.
- [ ] **Step 2: Full gates** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint` → all pass / clean.
- [ ] **Step 3: Record in `docs/DESIGN.md`** — append a Phase 5b block to the screen-notes section: the `/settings` layout (sectioned label+description rows with the control right-aligned), the header Settings gear, the "Last analyzed" relative label on list rows + detail header (coarse buckets; "Not analyzed" for never-run, consistent with the health placeholder), and the digest toggle styling. Add dated decisions-log entries (2026-06-15).
- [ ] **Step 4: Commit** (after approval)
```bash
git add docs/DESIGN.md <any-touched-component-files>
git commit -m "docs: record Phase 5b digest-UI design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage (5b spec §2–§6):**
- "Last analyzed" on list (via `lastAnalyzedByThesisIds` second query, not a join) + detail (derived from loaded runs) + `formatRelativeTime` → Tasks 1–3. ✓
- Settings page: digest toggle (Server Action wrapping `setDigestEnabled`) + run-now (`triggerWeeklyDigestNow`) + copy → Tasks 4–7. ✓
- Header nav link → Task 7. ✓
- "Not analyzed" empty state consistent with health placeholder → Tasks 2, 3. ✓
- Design pass + DESIGN.md → Task 8. ✓
- Out of scope (unsubscribe token, digest history, other channels) correctly excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. Two verify-or-fallback notes (Button `outline` variant; `lucide-react` presence) are explicit with concrete fallbacks, not gaps.

**Type consistency:** `formatRelativeTime(date: Date | null, now?)` defined Task 1, consumed Tasks 2–3. `ThesisRow` gains `lastAnalyzed: Date | null` (Task 2). `setDigestEnabledAction(enabled: boolean): Promise<ActionResult>` defined Task 4, consumed by `DigestToggle` Task 5. `triggerWeeklyDigestNow` (5a) consumed by `RunAnalysisButton` Task 6. `getUserById`/`setDigestEnabled` (5a repos), `lastAnalyzedByThesisIds` (5a repo) consumed in Tasks 2/4/7. `user.digestEnabled` (schema field) read in Task 7.
```
