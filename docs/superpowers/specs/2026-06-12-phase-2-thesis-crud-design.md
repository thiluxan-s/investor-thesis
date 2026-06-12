# Phase 2 — Thesis & Claim CRUD — Design

**Date:** 2026-06-12
**Phase doc:** `docs/phases/phase-2-thesis-crud.md`
**Status:** design approved; ready for implementation plan.

## Goal

A user can create theses with claims, view them in a list and a detail page, edit them, and delete them. Pure user-side experience — **no agent runs, no evaluation, no AI calls, and no health *computation*** (that lands in Phase 4). The `current_health_score` columns exist but are only defaulted, never written, this phase.

## Scope boundary

In scope: `theses` + `claims` schema, repositories, Server Actions, the `/theses` list, the `/theses/new` wizard, the `/theses/[thesisId]` detail page, validation, and empty/error states.

Out of scope (deferred, with the seam noted): agent runs and the trace view (Phase 3), health scoring and the over-time chart (Phase 4), the paragraph/drafter creation mode (Phase 6), demo seeding and the read-only demo account (its own phase), claim drag-reordering, and soft deletes.

## Decisions locked during brainstorming

1. **Claim-count invariant: min 2, max 5.** Enforced at create. After creation, `deleteClaim` **blocks the deletion that would drop a thesis below 2 claims** (returns a validation error). Min 2 because the agent needs more than one signal to reason against.
2. **Immutable after creation: `ticker`, `position_direction`, `time_horizon`.** Changing the ticker would orphan future evidence. `updateThesis` only edits `title`, `status`, and `notes`. Claims are edited through their own actions.
3. **No `draft` status.** The enum stays `active` / `paused` / `closed`. "I'm still planning, don't run the agent yet" is exactly `paused`. The user **picks initial status at creation** (defaults to `active`, `paused` selectable); `closed` becomes reachable via edit. (`closed` is not offered as an initial creation choice — you don't open a position already exited.)
4. **`notes`** are optional, **not collected in the wizard**, and editable on the detail page. Kept off the wizard to avoid a "wall of fields."
5. **Health placeholder is honest.** The list and detail render an explicit *"Not analyzed yet"* / *"No analysis yet"* state — never a fabricated `0.00` score or fake bar.
6. **Native forms.** Server Actions + `useActionState` + Zod. No `react-hook-form`, no new form dependency.
7. **List layout: flat rows** (Linear-style), not cards. Honors DESIGN.md "flat over carded" + "density on data surfaces."
8. **Detail layout: two-column** — main column = claims; right rail = thesis meta (ticker/position/horizon/status), notes, and an "Analysis" placeholder. The rail is where Phase 4 health summary and Phase 3 run *list* will live; the Phase 3 trace itself opens full-width (decided in Phase 3).
9. **Wizard: dedicated `/theses/new` route** (not a modal), two steps: (1) Position basics, (2) Claims. Scales to the Phase 6 paragraph tab.
10. **Claim editing: inline** via a single shared `ClaimForm` (statement textarea + category select) reused in the wizard, "add claim," and "edit claim." On the detail page the row expands into the form in place.
11. **Reordering deferred.** `ordinal` is populated on insert (append order) so ordering is stable and honest, but there is no drag-to-reorder UI this phase.

## Data model

New tables per `docs/DATA_MODEL.md`. Drizzle, snake_case columns, camelCase JS, every table has `id` / `created_at` / `updated_at`. Migration generated via `db:generate` and committed.

### Enums (pgEnum)

- `position_direction`: `long` | `short`
- `time_horizon`: `weeks` | `months` | `6_to_12_months` | `years`
- `thesis_status`: `active` | `paused` | `closed`
- `claim_category`: `financial_performance` | `product_traction` | `competitive_position` | `macro_environment` | `execution` | `valuation` | `other`

### `theses`

`id`, `user_id` (fk → users.id, **on delete cascade**, indexed), `title` (text), `ticker` (text, canonicalized uppercase), `position_direction`, `time_horizon`, `status` (default `active`), `notes` (text, nullable), `created_at`, `updated_at`.

Indexes: `user_id`; composite `(user_id, status)` for the active filter.

### `claims`

`id`, `thesis_id` (fk → theses.id, **on delete cascade**, indexed), `ordinal` (integer), `statement` (text), `category` (claim_category), `current_health_score` (numeric(3,2), default 0), `current_health_updated_at` (timestamptz, nullable), `created_at`, `updated_at`.

The `current_health_*` columns are written by Phase 4 only.

## Validation (Zod, cross-cutting)

Schemas live in `schemas/` (cross-cutting, per CLAUDE.md), are the source of truth, and are shared by the client form, the Server Action, and the repository boundary. Types via `z.infer`.

- **Ticker:** `/^[A-Z]{1,6}$/` after trimming + uppercasing. Canonicalize (`.trim().toUpperCase()`) *before* validating. (Tickers with dots are explicitly a later concern per the phase doc.)
- **Title:** required, 3–120 chars (trimmed).
- **Claim statement:** 10–300 chars (trimmed).
- **Claims array on create:** length 2–5; each a valid claim with a category.
- **Notes:** optional, ≤ 2000 chars.
- **Enums:** `z.enum` mirroring the pgEnums. Creation status restricted to `active` | `paused`; `closed` allowed only on update.

## Repositories — `lib/db/repositories/`

All DB access funnels through here (matching `users.ts`). No raw Drizzle outside repositories.

`theses.ts`:
- `createThesisWithClaims(userId, input)` — single transaction: insert thesis + its claims with sequential `ordinal`.
- `listThesesByUser(userId)` — with claim counts for the list view.
- `getThesisForUser(userId, thesisId)` — thesis + ordered claims; returns null if not found **or not owned** (ownership enforced in the query).
- `updateThesis(userId, thesisId, { title?, status?, notes? })`.
- `deleteThesis(userId, thesisId)` — cascade handles claims.

`claims.ts`:
- `addClaim(userId, thesisId, { statement, category })` — appends with next `ordinal`; enforces max 5.
- `updateClaim(userId, claimId, { statement?, category? })`.
- `deleteClaim(userId, claimId)` — enforces the min-2 invariant (blocks last-two deletion).
- `countClaims(thesisId)` — helper for invariant checks.

Every function takes `userId` and scopes by ownership at the query level (join through `theses.user_id`). A claim-level action verifies the parent thesis is owned.

## Server Actions

Colocated with the `theses` routes. All return `{ ok: true, data } | { ok: false, error }` (never throw across the boundary). All resolve the current user via Clerk and a `requireUserId()` helper, then delegate to repositories. Mutations call `revalidatePath` for the affected list/detail route.

- `createThesis(input)` → validates basics + 2–5 claims, canonicalizes ticker, creates, returns new `thesisId` (caller redirects to detail).
- `listTheses()` (read; may also be a direct Server Component fetch — see UI).
- `getThesis(thesisId)`.
- `updateThesis(thesisId, { title?, status?, notes? })`.
- `deleteThesis(thesisId)`.
- `addClaim(thesisId, claim)`, `updateClaim(claimId, patch)`, `deleteClaim(claimId)`.

Read paths in Server Components call repositories directly; Server Actions are for mutations and any client-triggered reads.

## UI

All Server Components by default; `"use client"` only where a form needs `useActionState`/interactivity (wizard, inline claim editing, status select, delete confirmation).

### `/theses` — list (flat rows)

Page header ("Your theses" + count, "New thesis" → `/theses/new`). Flat rows separated by hairlines (`zinc-100`/`zinc-200`), each row: ticker pill (mono) + Long/Short tag + title + `N claims · {horizon}` meta on the left, a "Not analyzed yet" placeholder (dashed empty track) in the middle, status chip on the right. Row links to detail.

**Empty state:** the existing dashed-box empty state, updated to point at "New thesis" (replacing the Phase-1 "arrives next phase" copy).

### `/theses/new` — wizard (two steps, client)

- **Step 1 — Position:** ticker (mono input, auto-uppercase, 1–6 letters, helper text), Long/Short segmented toggle, time-horizon select, status select (Active default; Paused selectable with "agent won't run on a paused thesis" helper). "This is locked once you create it" note. Cancel / Next.
- **Step 2 — Claims:** "N of 2–5" live counter, added claims listed compact, shared `ClaimForm` to add the next (statement + category). Back / **Create thesis** (disabled until ≥ 2 valid claims). On success, redirect to the new detail page.

Step state is held client-side; a single `createThesis` call submits at the end (no partial persistence — there's no thesis until "Create").

### `/theses/[thesisId]` — detail (two-column)

Breadcrumb + header: editable title, ticker (mono) + Long/Short + horizon + status badges, disabled **"Analyze now"** button with tooltip "Available next phase."

- **Main column — Claims:** "Claims · N", each claim shows category badge + statement + Edit/Delete. Edit expands the row into the shared `ClaimForm` inline. "+ Add claim" appends a `ClaimForm` (hidden when at 5). Delete on a claim is blocked with a clear message when only 2 remain.
- **Right rail:** meta table (ticker/position/horizon — read-only; status — editable select), Notes (editable, optional, empty-state prompt when blank), and an "Analysis" section showing the "No analysis yet — available next phase" placeholder.

**Delete thesis:** lives in the detail page (e.g. rail footer or a quiet menu), guarded by an AlertDialog confirmation; on confirm, delete and redirect to `/theses`.

## Components

Reused: `button`, `input`, `label`, `card`, `sonner` (toasts for action results).

**New shadcn components to add** (registry fetch per DESIGN.md's classic-Radix decision — *requires approval before install*): `select`, `textarea`, `badge`, `tooltip`, `alert-dialog`. (`dialog` not needed — wizard is a route, claim editing is inline.)

**New app components:**
- `components/theses/ClaimForm.tsx` — shared statement+category editor (client).
- `components/theses/ThesisRow.tsx` — list row.
- `components/theses/NewThesisWizard.tsx` — the two-step client flow.
- `components/theses/StatusSelect.tsx`, `ClaimList.tsx`, `DeleteThesisButton.tsx` — detail-page pieces.
- Category-badge + status-chip helpers (small, presentational).

## Empty states & error handling

- No theses → updated empty state with the live "New thesis" CTA.
- Thesis with claims always ≥ 2 by invariant; no "no claims" state needed post-create.
- Wizard: inline field errors (bad ticker, claim too short/long, < 2 claims) — "Create" stays disabled until valid; server re-validates and returns `{ ok:false, error }` surfaced via toast as a backstop.
- Detail: blocked last-claim deletion → clear message ("A thesis needs at least 2 claims"). Failed mutation → error toast, optimistic UI reverts.
- 404 / not-owned thesis → `notFound()`.

## Testing (TDD targets)

Per CLAUDE.md, UI tests can wait; logic tests are the valuable ones. Write tests first for:
- **Validation schemas:** ticker canonicalization + bounds, claim length bounds, claims-array 2–5, status creation restriction.
- **Repositories** (against a test DB or mocked boundary): ownership scoping (a user can't read/mutate another user's thesis/claim), the min-2 delete invariant, the max-5 add invariant, `ordinal` sequencing.
- **Server Actions:** the `{ ok }` contract on happy path and at least one failure per action.

## DESIGN.md updates (during implementation)

Fill the `/theses` and `/theses/[id]` per-screen blocks in `docs/DESIGN.md` with the layout decisions above (flat rows; two-column detail with right rail; honest "Not analyzed yet" placeholder; inline shared `ClaimForm`) and add dated entries to the decisions log.

## Definition of done

`npm run typecheck` clean; `npm run lint` clean; happy path works end-to-end manually; failure cases handled (bad input, blocked deletion, not-owned 404); migration generated + applied + committed; new env vars (none expected) reflected; DESIGN.md updated; **change approved before each commit** per CLAUDE.md.
