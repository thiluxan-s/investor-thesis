# Phase 6b — Demo Path + Seed — Design Spec

**Date:** 2026-06-15
**Status:** Approved for planning
**Goal:** A visitor can click "Try the demo" on the landing page and land on a pre-seeded, read-only thesis dashboard (and its agent-run trace) with no sign-up — the real product, with one thesis already there.

**Prerequisite:** Phase 6a merged. Second sub-phase of Phase 6 (after 6a drafter; before 6c landing polish, 6d hardening, 6e ship).

---

## 1. Scope

A re-seedable demo thesis (real evidence/verdicts via the fixtured pipeline + a seeded multi-week health trend), public read-only `/demo` routes, a demo banner, and a "Try the demo" landing CTA. Read-only is **structural**, not an account flag.

### Out of scope
- Landing-page visual polish (hero/screenshots) — **6c**. (6b only adds the "Try the demo" CTA wiring.)
- README / OG image / demo video / deploy — **6e**.
- A real Clerk demo account or programmatic sign-in — explicitly rejected; the demo is unauthenticated public reads.

---

## 2. Demo constants

`lib/demo/constants.ts` (client-safe — no server imports; the `/demo` pages build run links from `DEMO_THESIS_ID`):
- `DEMO_THESIS_ID` — a fixed UUID, so `/demo` and run links are stable across re-seeds.
- `DEMO_USER_CLERK_ID = "demo-user"` — a sentinel; **no real Clerk account exists for it**, so nobody can authenticate as the demo user.
- `DEMO_USER_EMAIL` — a generic configured address (no personal PII), e.g. `"demo@thesistracker.app"`.

## 3. Seed — `scripts/seed-demo.ts`

Idempotent / re-seedable. Run with `USE_AI_FIXTURES=1` + `.env.local` (Node 22):
1. Delete the existing demo thesis (`DEMO_THESIS_ID`) if present — cascade removes its runs/iterations/evidence/links/snapshots. Upsert the demo user (`DEMO_USER_CLERK_ID`, `DEMO_USER_EMAIL`, `digest_enabled = false`).
2. Create the demo thesis at the fixed `DEMO_THESIS_ID` (NVDA, long, a real title + 3 claims).
3. Run the **offline fixtured researcher+evaluator pipeline once** (the existing `run-agent-fixture` mechanism, refactored into a reusable helper if convenient): produces a real `agent_run` + iterations + evidence + `claim_evidence_links` + current claim health + one `thesis_health_snapshots` row. This powers the **agent trace** (the wow moment) and the **claim health bars**.
4. Insert **2–3 backdated `thesis_health_snapshots`** (week-spaced `recordedAt`) with a hand-set trajectory ending at the run's real current overall score, so `HealthChart` renders a multi-week **trend** rather than a single point. These are **explicitly seeded demo history** (the trace + claim verdicts remain real).
5. Print a summary (thesis id, runs, evidence, snapshots) and the `/demo` URL.

The seed is the single source of demo data; re-running it fully refreshes the demo.

## 4. Public demo routes (outside the auth group)

Under `app/demo/` — **not** in `(app)`, so no `requireUserId`, no redirect, no Clerk session required.

- `app/demo/page.tsx` — read-only dashboard. Renders: a breadcrumb/title header (ticker / direction / horizon / "Last analyzed"); a **read-only** claim list with `HealthBar` per claim; the thesis-health summary + `HealthChart`; the list of agent runs (read-only, linking to the trace). **No** write controls (no Analyze-now, edit, delete, status select, notes editor, drafter). A `DemoBanner` at the top.
- `app/demo/runs/[runId]/page.tsx` — read-only agent trace, reusing `RunHeader` / `IterationCard` / `EvidenceCard` (all already read-only) + `DemoBanner`.

### Demo-scoped reads — `lib/demo/queries.ts`
Wraps **unscoped** repo reads but bakes in the demo scope:
- `getDemoThesis()` → the demo thesis + claims (by `DEMO_THESIS_ID`).
- `getDemoRuns()` → runs for the demo thesis (for the dashboard list).
- `getDemoRun(runId)` → the run **only if `run.thesisId === DEMO_THESIS_ID`**, else `null`. This guard is load-bearing: it stops `/demo/runs/[anyRunId]` from leaking an arbitrary user's run by id. `null` → `notFound()`.
- Plus the read helpers the pages need (iterations, evidence, sources, links→verdicts, snapshots), reusing existing repos. Any new unscoped repo read (e.g. `getThesisById`, `getAgentRunById`) is added narrowly and used **only** through `lib/demo/queries.ts`.

## 5. Read-only enforcement — by construction

No per-action read-only flag is needed:
- The demo visitor is **unauthenticated**; every mutation Server Action calls `requireUserId` and is **ownership-scoped**, so there is nothing a visitor can mutate.
- The `/demo` pages render **no write UI**.
- Ownership scoping keeps the demo thesis out of every real user's dashboard, and a real user hitting `/theses/DEMO_THESIS_ID` gets `notFound()` (not their thesis).
- A read-only `components/demo/DemoClaimList.tsx` (static cards + `HealthBar` + `CategoryBadge`) renders claims without importing the editable, client-side `ClaimList`.

This is simpler and stronger than an account-level read-only flag, and it's why the "shared demo account" approach was rejected.

## 6. Banner + landing CTA

- `components/demo/DemoBanner.tsx` — a calm top banner on `/demo` pages: "You're viewing a live demo thesis — read-only. Sign up to track your own." + a Sign-up button (`/sign-up`). Design-language consistent (zinc, deep-blue accent).
- `app/page.tsx` — add a **"Try the demo"** button to the hero (alongside the existing Sign-up CTA) linking to `/demo`. (Visual polish of the hero itself is 6c; this is just the link.)

## 7. Keep the demo out of scheduling

So the weekly cron never auto-runs the demo or emails the fake address (independent of `SCHEDULED_RUNS_ENABLED`):
- `listUserIdsWithActiveTheses` excludes the demo user (filter by `DEMO_USER_CLERK_ID`'s user, or by a `WHERE clerk_user_id <> 'demo-user'` join condition).
- The demo user is seeded with `digest_enabled = false` (belt-and-suspenders against any email path).

## 8. Error & edge states

- **Demo not seeded yet:** `getDemoThesis()` returns null → `/demo` shows a small "Demo isn't available right now" placeholder (not a crash). (In practice the seed runs at deploy time.)
- **`/demo/runs/[runId]` with a non-demo or unknown runId:** `getDemoRun` returns null → `notFound()`. No cross-user leakage.
- **Chart with the seeded snapshots:** ≥2 snapshots → the trend line renders (not the placeholder).

## 9. Testing

- `getDemoRun` scope guard: returns null for a run whose `thesisId !== DEMO_THESIS_ID`, returns the run otherwise — the one security-relevant unit (mock/inject the underlying read).
- Seed script verified by running it against the dev DB (asserts thesis + ≥1 run + evidence + ≥2 snapshots).
- `/demo` and `/demo/runs/[runId]` verified manually (no auth required — easy to load).
- UI component tests deferred per CLAUDE.md.

## 10. File map

```
lib/demo/constants.ts                       # DEMO_THESIS_ID, DEMO_USER_CLERK_ID, DEMO_USER_EMAIL
lib/demo/queries.ts                         # getDemoThesis, getDemoRuns, getDemoRun (scope-guarded)
scripts/seed-demo.ts                        # re-seedable demo seed (fixtured pipeline + backdated snapshots)
app/demo/page.tsx                           # public read-only dashboard
app/demo/runs/[runId]/page.tsx              # public read-only trace
components/demo/DemoBanner.tsx              # read-only demo banner + sign-up CTA
components/demo/DemoClaimList.tsx           # read-only claim list (static cards + HealthBar)
app/page.tsx                                # add "Try the demo" CTA → /demo
lib/db/repositories/users.ts                # listUserIdsWithActiveTheses excludes the demo user
lib/db/repositories/{theses,agent-runs}.ts  # narrow unscoped getById reads (used only via lib/demo/queries.ts)
```
