# Phase 5b — Digest UI — Design Spec

**Date:** 2026-06-15
**Status:** Approved for planning
**Goal:** Surface the Phase 5a digest backend in the UI — a "Last analyzed" timestamp on theses, a settings page to toggle the weekly email digest, and an on-demand "Run weekly analysis now" trigger.

**Prerequisite:** Phase 5a (scheduled runs + digest backend) — merged to `main`.

This refines section 9 of the Phase 5 spec (`docs/superpowers/specs/2026-06-14-phase-5-schedule-and-digest-design.md`) with the resolved placement and data-access decisions.

---

## 1. Scope

Three UI additions, all reading/triggering Phase 5a backend that already exists:
1. **"Last analyzed"** relative timestamp on thesis list rows and the detail header.
2. **Settings page** (`/settings`) with the digest on/off toggle and the "Run weekly analysis now" button, reached via a header nav link.
3. **Design pass** + `DESIGN.md` update.

### Out of scope (YAGNI)
- Unsubscribe-link / email-token flow — the in-app toggle is the control for v1.
- Digest history / "past digests" UI.
- Notification channels beyond email.
- Per-user schedule customization.

---

## 2. "Last analyzed"

Derived from each thesis's most recent **terminal** agent run's `completedAt` — no new column.

- **List rows:** the thesis list page (`app/(app)/theses/page.tsx`) calls `listThesesByUser`, then makes a **second query** via the existing `lastAnalyzedByThesisIds(thesisIds)` repo helper (built in 5a) to get a `Map<thesisId, Date>`, and passes the per-row value into `ThesisRow`.
  - **Why a second query, not a join:** `listThesesByUser` already `leftJoin`s `claims` and `groupBy`s thesis to compute `avg(health)` / `count(claims)`. Adding a second `leftJoin` to `agent_runs` would cartesian-product (claims × runs), inflating those aggregates. A separate keyed query is correct and cheap (one extra round trip for the page).
  - `ThesisRow` renders it in the existing meta line: `{claimCount} claims · {horizon} · Analyzed {relative}` (or `· Not analyzed` when null).
- **Detail header:** the detail page (`app/(app)/theses/[thesisId]/page.tsx`) already loads `runs` via `listAgentRunsForThesis`. Derive `lastAnalyzed` = the most recent terminal run's `completedAt` and show it near the title/badges.
- **Formatting:** a pure `formatRelativeTime(date: Date | null, now?: Date): string` in `lib/format/relative-time.ts` → e.g. `"2d ago"`, `"3h ago"`, `"just now"`, and `"Not analyzed"` for null. Unit-tested (TDD). Uses coarse buckets (seconds/minutes/hours/days/weeks); no external date lib.

---

## 3. Settings page

New route `app/(app)/settings/page.tsx` — a Server Component that loads the current user (`requireUserId` → `getUserById`) and renders two sections plus explanatory copy.

- **Notification preferences:** a digest on/off control bound to `users.digest_enabled`.
  - `components/settings/DigestToggle.tsx` (`"use client"`) — a switch/checkbox that calls a new Server Action `setDigestEnabledAction(enabled: boolean)` and toasts on result. The action: `requireUserId` → `setDigestEnabled(userId, enabled)` (existing repo fn) → `revalidatePath("/settings")`; returns the `ActionResult` shape (`{ ok: true, data: undefined } | { ok: false, error }`).
  - One line of copy: what the weekly digest is and when it sends.
- **Run weekly analysis now:** `components/settings/RunAnalysisButton.tsx` (`"use client"`) — a button calling the existing `triggerWeeklyDigestNow()` action; on success a toast ("Analysis queued — your digest emails when the runs finish"), with a pending state while the action runs. Brief copy noting it analyzes all active theses and emails the digest.

New Server Action lives in `app/(app)/settings/actions.ts` (`setDigestEnabledAction`); `triggerWeeklyDigestNow` stays in `app/(app)/theses/agent-actions.ts` (already built in 5a).

---

## 4. Navigation

Add a **Settings** affordance to the header in `app/(app)/layout.tsx` — a link (gear icon + label, Lucide `Settings` icon) placed left of the `UserButton`. Active-state styling consistent with the design language (zinc neutrals, deep-blue accent).

---

## 5. Error handling & empty states

- **Never analyzed:** `lastAnalyzedByThesisIds` omits theses with no completed run → the row/detail shows **"Not analyzed"** (consistent with the Phase 4b health placeholder convention).
- **Toggle failure:** the Server Action returns `{ ok: false, error }`; the client toasts the error and reverts the optimistic state (or re-reads from the server-rendered value).
- **Run-now while a batch is mid-flight:** harmless — `triggerWeeklyDigestNow` upserts the batch (5a's unique constraint) and re-runs; the button just toasts "queued."
- **No active theses:** run-now is a no-op server-side (the scheduler creates no batch); the toast still confirms the request was queued. *(Acceptable; a future refinement could disable the button when the user has zero active theses.)*

---

## 6. Testing

- `formatRelativeTime` — unit tests (TDD): seconds → "just now", minutes/hours/days/weeks buckets, null → "Not analyzed", boundary rounding.
- Settings page, toggle, run-now button, and the `ThesisRow`/detail changes: typecheck + lint + manual verification (UI tests deferred per CLAUDE.md). Manual: toggle persists across reload; run-now toasts and (with `USE_AI_FIXTURES`) drives a batch.

---

## 7. File map

```
lib/format/relative-time.ts                       # formatRelativeTime (pure) + test
app/(app)/settings/page.tsx                        # settings (Server Component)
app/(app)/settings/actions.ts                      # setDigestEnabledAction
components/settings/DigestToggle.tsx               # "use client" toggle
components/settings/RunAnalysisButton.tsx          # "use client" run-now button
app/(app)/layout.tsx                               # header Settings nav link
app/(app)/theses/page.tsx                          # fetch lastAnalyzed map, pass to rows
components/theses/ThesisRow.tsx                     # "Analyzed {relative}" in meta line
app/(app)/theses/[thesisId]/page.tsx               # "Last analyzed" in detail header
docs/DESIGN.md                                     # record 5b decisions
```
