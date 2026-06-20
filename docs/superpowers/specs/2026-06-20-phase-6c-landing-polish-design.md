# Phase 6c — Landing Polish + Product Showcase — Design Spec

**Date:** 2026-06-20
**Status:** Approved for planning
**Goal:** The landing page reads as a senior portfolio piece in ~10 seconds and makes "Try the demo" irresistible — by showing the *actual* product UI (live components in a browser frame), not a static screenshot.

**Prerequisite:** Phase 6b merged (the `/demo` path exists, so the showcase frames can link into a real demo). Third sub-phase of Phase 6 (after 6a drafter, 6b demo path; before 6d hardening, 6e ship).

---

## 1. Scope

Focused polish of `app/page.tsx`: refine the existing hero, add a real **product showcase** built from the app's own presentational components inside a browser-chrome frame, and keep the existing "how it works" strip with a light touch-up.

### Out of scope
- OG image, favicon, README, demo video, deploy → **6e**.
- Formal mobile audit + accessibility pass → **6d**. (New sections are built responsive as we go, but the audit is 6d.)
- Any change to the `/demo` routes or the demo seed — 6c only consumes the *idea* of the demo via a link.

---

## 2. Layout — three sections (light theme, generous marketing spacing)

1. **Hero (refined).** Keep today's structure — eyebrow + headline + lede + two CTAs ("Create your thesis" primary, "Try the demo" outline, "No sign-up required" helper). Tighten typography rhythm, spacing, and the `animate-rise` entrance. The right column's hand-built `ClaimPreview` card is **replaced** by a `BrowserFrame` wrapping a live dashboard mock.
2. **Product showcase — "Watch the agent think."** A section featuring a `BrowserFrame` of the agent-trace (the differentiator the phase doc calls out): one iteration's reasoning → a tool call → an evidence card with strengthens/weakens verdicts. A short section heading + lede frames why it matters (inspectable agent reasoning).
3. **How it works.** The existing 3-step hairline-divided strip, kept; light spacing/type touch-up only.

## 3. Showcase architecture (the load-bearing decision)

- **`components/landing/BrowserFrame.tsx`** — a presentational wrapper: subtle chrome (three traffic-light dots + a faux `thesistracker.app/demo` URL pill) around `children`, on an elevated light surface (border + soft shadow, matching the existing hero card's shadow language). The frame is wrapped in `<Link href="/demo">` so clicking the "screenshot" opens the real demo. Accepts an optional `url` label prop (e.g. `/demo`, `/demo/runs/…`).
- **The frames reuse the genuinely pure, prop-driven components:** `HealthBar` (`components/agent/HealthBar.tsx`), `HealthChart` (`components/theses/HealthChart.tsx`, takes `points[]`), `CategoryBadge` (`components/theses/CategoryBadge.tsx`), and the evidence-verdict tag visual language from `EvidenceCard`. They are fed **hand-built static props** defined as in-file constants in a showcase data module.
- **Critical constraint — the landing page stays a static Server Component:** no DB access, no auth, no `getDemo*` / repository calls. All showcase data is in-file typed constants. This is legitimate illustrative marketing chrome (the components are pure), not a prohibited "placeholder data flow" — and the real, live version is one click away at `/demo`.
- **Trace frame fallback:** the real `IterationCard` is a client component built around DB-row types (`AgentRunIteration`, evidence/source/verdict maps) plus Motion. If reusing it verbatim requires hand-constructing DB rows that are awkward/brittle, build a small faithful **`ShowcaseTrace`** (`components/landing/`) that uses the **same visual tokens** (numbered spine, reasoning text, a tool-call chip, an evidence card with verdict dots + confidence) rather than the real component. The decision (reuse vs. faithful rebuild) is made during implementation and **recorded in `docs/DESIGN.md`**. Either way the result must match the trace's real visual language.

## 4. Motion

Keep the existing `animate-rise` stagger on the hero. Add **one** tasteful moment: the browser frames settle in on scroll via Motion `whileInView` (subtle fade/rise, once). No gratuitous animation, per CLAUDE.md's "one or two thoughtful moments per page."

## 5. Data & types

The showcase constants are typed to the components they feed (e.g. claim-like rows with `category` + `currentHealthScore` + `currentHealthUpdatedAt` for `HealthBar`/`CategoryBadge`; `HealthPoint[]` for `HealthChart`). Where a component expects a full DB-row type, define a minimal local view type that the component actually consumes rather than faking an entire `$inferSelect` row, to keep the constants readable. No `any`.

## 6. Error & edge states

- Marketing page — no async, no failure modes. It renders the same for signed-in and signed-out visitors (the existing Clerk `<Show>` nav swap is kept: signed-out → Sign in / Create; signed-in → Go to dashboard).
- Frames must degrade gracefully at narrow widths (no horizontal overflow) — built responsive; formal mobile audit is 6d.

## 7. Testing

UI work, so per CLAUDE.md: `npm run typecheck` + `npm run lint` clean, and manual verification (landing renders; hero + both frames are crisp; frames link to `/demo`; signed-in/out nav still correct). No new unit tests unless a pure helper is extracted (then test it).

## 8. Design pass + DESIGN.md

After implementation, a frontend-design pass on the hero, the two frames, and the showcase section (Linear/Vercel/Granola bar). Append a "Landing polish (Phase 6c)" screen-notes block to `docs/DESIGN.md` and decisions-log entries (2026-06-20): (a) product showcase = live prop-driven components in a `BrowserFrame`, not screenshots, kept DB-free on a static page; (b) the trace-frame reuse-vs-rebuild decision actually made.

## 9. File map

```
app/page.tsx                              # refined hero + showcase section; ClaimPreview removed
components/landing/BrowserFrame.tsx       # chrome wrapper, links to /demo
components/landing/showcase-data.ts       # in-file static showcase constants (typed)
components/landing/ShowcaseTrace.tsx      # ONLY if IterationCard reuse is too heavy (decided at impl)
docs/DESIGN.md                            # screen notes + decisions log
```
