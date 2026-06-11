# Phase 2 — Thesis & Claim CRUD

**Goal:** A user can create theses with claims, view them in a list and detail view, edit, and delete. No agent runs, no evaluation, no AI calls. Just the user side of the experience.

**Prerequisite:** Phase 1 complete.

## Deliverables (high level — fill in detail before starting)

1. Schema additions: `theses`, `claims`.
2. Repository functions for theses and claims.
3. Server Actions:
   - `createThesis(input)` — validates ticker, position, time horizon, claims (2-5).
   - `listTheses()` — for the current user.
   - `getThesis(thesisId)` — with claims, ownership check.
   - `updateThesis(thesisId, input)` — title, status, notes.
   - `deleteThesis(thesisId)` — cascade.
   - `addClaim(thesisId, claim)`, `updateClaim`, `deleteClaim`.
4. UI:
   - `/theses` — list of theses with health placeholder (will be wired up in Phase 4). "New thesis" dialog/wizard.
   - `/theses/[thesisId]` — detail page: title, ticker, claims list with category badges, edit affordances, "Analyze now" button (disabled until Phase 3), "Delete thesis" with confirmation.
5. Empty states and validation everywhere. Helpful errors when the user tries to create a thesis with no claims, or 6+ claims.

## Notes for when we get here

- "New thesis" wizard is multi-step (ticker + position → claims). Don't make a wall of fields. Multi-step lowers cognitive load and gives the agent a moment to load.
- Validation: ticker uppercase A-Z only, 1-6 chars (some have dots — handle later). Claims 10-300 chars each.
- Don't store ticker case-sensitively — canonicalize to uppercase before insert.
- The "Analyze now" button should exist but be disabled with a tooltip ("Available next phase") — sets the expectation visually.

---

(More detail to be added before starting this phase.)
