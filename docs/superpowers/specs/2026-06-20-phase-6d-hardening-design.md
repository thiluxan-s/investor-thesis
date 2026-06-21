# Phase 6d — Cross-cutting Hardening — Design Spec

**Date:** 2026-06-20
**Status:** Approved for planning
**Goal:** Every screen works on a phone, loads gracefully, and degrades calmly — so the app reads as production-quality, not a desktop prototype.

**Prerequisite:** Phase 6c merged. Fourth sub-phase of Phase 6 (after 6a drafter, 6b demo path, 6c landing; before 6e ship).

**Audience reminder:** recruiters, often on a phone, in a ~90-second demo. This phase removes the rough edges that would undercut the senior-quality impression — not an exhaustive audit.

---

## 1. Scope

Five focused, cross-cutting concerns. Each is a robustness/polish pass over existing surfaces — no new product features.

1. Mobile responsiveness of the app + demo surfaces.
2. Route-level loading skeletons for the slower reads.
3. Branded error + not-found boundaries.
4. The one genuinely missing empty state (a completed run that found no new evidence).
5. A targeted accessibility pass.

### Out of scope
- **Drafter token-streaming + live paragraph-highlight-as-extracted** — deferred (a feature enhancement, not hardening; the drafter already works). Its own future sub-phase or v2.
- OG image / favicon / README / demo video / deploy → **6e**.
- A full WCAG audit — the a11y pass is targeted (main flows + custom controls), not exhaustive.
- Skeletons for `/settings` and `/theses/new` — fast/form-y surfaces; skipped.

### Already handled (verified — do NOT rebuild)
- 0-theses empty state (`app/(app)/theses/page.tsx`: "No theses yet" + "Create your first thesis").
- Failed-run error surfacing (red box on the trace page and `AgentRunPanel`, gated on `run.status === "failed" && run.error`).
- Drafter 0-claims calm inline message (`ParagraphDrafter.tsx`).
- "Not analyzed" health placeholder (`HealthBar`).

---

## 2. Mobile pass

The protected app surfaces use no responsive prefixes and assume desktop width. Make them reflow without horizontal overflow at ~375px:

- **Thesis detail (`app/(app)/theses/[thesisId]/page.tsx`):** the `grid-cols-[1fr_280px] gap-8` becomes single-column on mobile and the two-column split only at a breakpoint (e.g. `lg:grid-cols-[1fr_280px]`); the right rail (meta/status/notes/runs/health) stacks below the claims.
- **Demo dashboard (`app/demo/page.tsx`):** the same `grid-cols-[1fr_280px]` fix (it mirrors the detail page).
- **Trace (`app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`) and demo trace (`app/demo/runs/[runId]/page.tsx`):** confirm the timeline spine, iteration cards, and evidence cards don't overflow; tighten horizontal padding on small screens if needed.
- **`(app)` header (`app/(app)/layout.tsx`):** wordmark + nav cluster + Clerk button fit and remain tappable at narrow widths.
- **New-thesis wizard (`components/theses/NewThesisWizard.tsx` and its steps/forms):** the segmented control, claim cards, and CTAs reflow; tap targets are adequate.
- **Settings (`app/(app)/settings/page.tsx`):** already a narrow single column — verify only.

Approach: add Tailwind responsive prefixes (mobile-first: base = stacked, `lg:`/`md:` = current desktop layout). No new components. Don't change desktop appearance.

## 3. Loading skeletons

Add Next.js route-level `loading.tsx` (App Router Suspense fallback) for the slower RSC reads, each a **skeleton that matches the real layout** (CLAUDE.md: skeletons, not spinners):

- `app/(app)/theses/loading.tsx` — a few skeleton list rows matching `ThesisRow`.
- `app/(app)/theses/[thesisId]/loading.tsx` — header + two-column claim/rail skeleton.
- `app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx` — run-header + timeline skeleton.

Skeletons reuse the page's own spacing/widths so the swap is seamless. A small shared skeleton primitive (e.g. a `Skeleton` block using the existing zinc tokens with a subtle pulse) may be added under `components/ui/` if one doesn't exist; otherwise inline. `/settings` and `/theses/new` are skipped (fast/form surfaces).

## 4. Error & not-found boundaries

- **`app/(app)/error.tsx`** (client component, required `"use client"` + `reset`): a calm branded state — short "Something went wrong" message + a "Try again" button calling `reset()` + a link back to `/theses`. Replaces Next's dev-overlay/blank for any Server Component throw (e.g. DB hiccup) within the app group. Does not log secrets.
- **`app/not-found.tsx`** (root): a branded 404 — short message + a link home/to the dashboard. Hit by every `notFound()` call, including the demo scope guard (`/demo/runs/<non-demo-id>`).

Both reuse the design language (zinc, deep-blue accent, generous spacing) and match the calm-not-alarming tone established for tool errors.

## 5. Empty states — the one gap

A run can complete successfully yet record **no new evidence**. Today the trace just shows iterations with an empty evidence area, which reads as unfinished.

- On the trace page and `AgentRunPanel`, when `isTerminalStatus(run.status)`, the run is **not** failed, and `run.evidenceCollected === 0`, show a calm line — e.g. "This run found no new evidence." — distinct from the failed-run red box and from the "running" state.
- Quick audit of the other empty/loading states for consistent wording (reuse existing phrasings; don't invent parallel copy).

## 6. Accessibility pass (targeted)

Focused on the main flow (landing → demo/dashboard → trace; create-thesis) and custom (non-shadcn) interactive elements:

- **Focus-visible rings** on custom interactive elements that lack them: the landing `BrowserFrame` link, the `DigestToggle` switch, the new-thesis segmented control, evidence `<details>` summaries. shadcn primitives already ship focus styles — don't duplicate.
- **Keyboard nav:** tab order is logical through the create-thesis flow and the trace; `<details>` toggles and the switch operate via keyboard.
- **Semantics:** an `aria-label` sweep on icon-only controls (e.g. the header settings gear) and decorative elements marked `aria-hidden` (many already are); confirm one `<main>` landmark per app page.
- **Contrast:** check `text-zinc-400` muted text against its backgrounds for the smallest/most-important text; bump to `zinc-500` only where it fails AA for body-relevant text (leave deliberately-quiet decorative meta).

No automated a11y tooling is added (no new deps); checks are manual + reasoned.

## 7. Error & edge states (of this phase's own work)

- `error.tsx` must itself never throw (no async, no data deps); it only renders static UI + the `reset` button.
- Skeletons must not depend on data; they are static markup.
- Mobile changes must not alter desktop rendering (verify both widths).

## 8. Testing

UI work, so per CLAUDE.md: `npm run typecheck` + `npm run lint` clean, plus manual verification — mobile via a ~375px devtools viewport (no horizontal scroll on each surface), keyboard-only walk of the main flow, throttled load to see each skeleton, a forced `notFound()` and a forced throw to see the boundaries, and a completed-zero-evidence run for the new empty state. No faked unit tests; if a pure helper is extracted (unlikely), test it.

## 9. Design pass + DESIGN.md

A frontend-design pass on the new boundaries/skeletons and the reflowed mobile layouts (Linear/Vercel/Granola bar — they're impeccable on mobile). Append a "Hardening (Phase 6d)" screen-notes block to `docs/DESIGN.md` + decisions-log entries (2026-06-20): mobile-first responsive strategy (base stacked, `lg:` desktop); skeletons-not-spinners for list/detail/trace; branded `error`/`not-found`; the no-new-evidence empty state; the targeted (not exhaustive) a11y scope.

## 10. File map

```
app/(app)/theses/[thesisId]/page.tsx              # responsive grid
app/demo/page.tsx                                 # responsive grid
app/(app)/theses/[thesisId]/runs/[runId]/page.tsx # responsive padding (+ no-evidence empty state)
app/demo/runs/[runId]/page.tsx                    # responsive padding
app/(app)/layout.tsx                              # responsive header
components/theses/NewThesisWizard.tsx (+ steps)   # responsive wizard
components/agent/AgentRunPanel.tsx                # no-new-evidence empty state
app/(app)/theses/loading.tsx                      # NEW skeleton
app/(app)/theses/[thesisId]/loading.tsx           # NEW skeleton
app/(app)/theses/[thesisId]/runs/[runId]/loading.tsx # NEW skeleton
app/(app)/error.tsx                               # NEW branded error boundary
app/not-found.tsx                                 # NEW branded 404
components/ui/skeleton.tsx                         # NEW shared skeleton primitive (if not inline)
components/landing/BrowserFrame.tsx, components/settings/DigestToggle.tsx, etc. # focus-visible + aria touches
docs/DESIGN.md                                    # screen notes + decisions log
```
