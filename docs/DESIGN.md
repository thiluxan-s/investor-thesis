# Design

This document is the source of truth for visual design decisions on Thesis Tracker. Read it before any UI work. Update it after making a meaningful design choice.

The goal: avoid the "Next.js app that looks like a Next.js app" problem. Every screen should feel considered.

---

## Reference apps (the bar we're aiming for)

When in doubt, look at these. "Make this feel like X" is a more useful instruction than "make this polished."

- **[Linear](https://linear.app)** — the gold standard for product surfaces. Density, typography, motion, restraint.
- **[Vercel dashboard](https://vercel.com)** — clean information architecture, judicious use of color.
- **[Granola](https://granola.ai)** — warm but professional, great empty states, good "AI-assisted" UX patterns.
- **[Plain](https://plain.com)** — typography and information density.

What we are *not* aiming for:
- Default shadcn templates (they're a starting point, not an aesthetic).
- AI-startup gradient meshes and shader backgrounds.
- Centered marketing pages with three feature cards in a row.

---

## Design principles

These are the calls we made when the design comes under tension. When in doubt, default toward these.

1. **Density over generosity on data surfaces, generosity over density on marketing.** The thesis dashboard packs information. The landing page breathes. Don't apply uniform spacing across both.
2. **Flat over carded where possible.** Reach for whitespace and hairline separators before reaching for shadcn `<Card>`. Cards are for when you genuinely need to group things visually distinct from their context.
3. **Type does the work.** Color does subtle work. Borders do the least work. If you find yourself reaching for a border to create hierarchy, consider whether weight, size, or spacing can do it instead.
4. **One accent color.** A single deliberate accent (likely a deep blue or graphite, decided in Phase 1). Everything else is neutrals — but real neutrals with real contrast, not "everything is gray-400."
5. **Motion is purposeful or absent.** Use motion to communicate state change (data arriving, value updating, agent iterating). Don't use motion to make a static screen feel "alive." If a transition doesn't communicate something, cut it.
6. **Server Components by default isn't just architecture — it's visual quality.** Pages that render instantly feel premium. Pages that flash skeletons before populating feel sluggish, even at the same actual speed. Lean into server rendering as a design choice.

---

## Visual tokens

> To be finalized in Phase 1 when the landing page is built. This section gets concrete then.

### Color palette (placeholder — finalize Phase 1)

Working assumptions:
- **Neutrals:** Slate or Zinc (the shadcn defaults are fine starting points). Use the full range, including the very darkest (`zinc-950`) and very lightest (`zinc-50`).
- **Accent:** TBD. Candidates: a deep blue (`blue-700`), a graphite, or a warm earth tone. Avoid the saturated default `blue-600` of every Next.js demo.
- **Semantic colors:** for thesis health — strengthening (a green that isn't kelly-green), weakening (a red that isn't fire-engine-red), neutral (a gray that has presence). Calibrate these together so the dashboard's color bar reads coherently.

Decide and document the accent color before the end of Phase 1.

### Typography (placeholder — finalize Phase 1)

Working assumptions:
- **Sans serif** for everything. Inter, Geist, or Söhne (or a closest free-equivalent like Geist Mono for code/data).
- **One typeface family** — not three. If two, the second is a monospace for code, tickers, and numeric data.
- **Weight scale:** 400 / 500 / 600. Use all three. 500 is the most underused weight in default web design — lean into it for subtle emphasis.
- **Line height** generous on prose (1.6-1.7), tight on data (1.3-1.4).

### Spacing

- Default to **4/8/12/16/24/32/48/64** as the scale. Tailwind's defaults are this; just use them deliberately.
- For marketing surfaces: gaps of 32-64 between sections, 16-24 within sections.
- For data surfaces: 8-16 between rows, 4-8 within cells.
- Use whitespace as the primary grouping mechanism before reaching for borders.

### Borders

- Default: no border. Lean on whitespace.
- When borders are needed: either truly hairline on light backgrounds (`zinc-200` at 1px) or noticeable on dark backgrounds (`zinc-700+`).
- **Avoid `gray-300` everywhere.** The mid-gray hairline is the visual signature of "designed by default."

### Motion

- **Tasteful spring** for list mutations (claims appearing, evidence cards arriving).
- **Cross-fade** for state transitions, not slide-in (slides on a productivity app feel app-y in a bad way).
- **Stream text in** for agent reasoning blocks — Anthropic streaming directly into the UI, not waiting for completion.
- **Avoid hover animations** on cards or list items unless the hover communicates real affordance.

---

## Per-screen decisions

> Filled in as we build. Each screen gets a short block: layout choice, type choices, color choices, motion choices, and the reasoning for non-default ones.

### Landing page

**Goal:** A recruiter understands the product in 10 seconds. The "Try the demo" CTA gets clicked.

> Decisions go here once Phase 1 is built.

### `/theses` (thesis list)

**Goal:** A signed-in user with multiple theses can scan health at a glance and click into the most relevant.

> Decisions go here once Phase 2 is built. Consider: is each thesis a card or a flat row? Where does the health bar live? How prominent is the "New thesis" CTA?

### `/theses/[id]` (thesis detail / dashboard)

**Goal:** This is the main product surface. A user spends 95% of their app time here.

> Decisions go here once Phase 2 is built and refined through Phases 3-5. Consider: how is the page laid out (sidebar with claim navigation? Full-width with everything stacked? Two-pane?)? Where does the agent run history live (collapsed sidebar? Tab? Slide-over?)? Where does the time-series health chart fit?

### Agent run trace view

**Goal:** The wow moment of the entire app. Where a recruiter lingers.

> Decisions go here when Phase 3 ships. Consider: is the trace a vertical timeline, a chat-style sequence, or something more spatial? How is streaming presented? How are tool calls rendered (collapsed by default? Always expanded?)? How are tool errors made obvious without being alarming?

### New thesis flow (manual + paragraph)

**Goal:** Two modes feel like one product, not like two separate flows bolted together.

> Decisions go here when Phase 6 ships. Consider: how does the tabbed interface feel? When the drafter is running, what does the UI show? How are drafted claims rendered for review (cards with source highlights? Inline editable fields?)?

---

## Decisions log

Newest first. Capture meaningful choices with one-sentence rationale.

> Entries go here as the project develops. Examples of what to log:
>
> - "Picked the accent color: `#1E3A5F` (deep blue, lower saturation than `blue-700`). Reason: distinct from every default Tailwind blue, reads as serious and trustworthy, contrast-safe on both light and dark backgrounds."
> - "Health indicator: gradient bar from -1 (red `#B23A48`) through 0 (neutral `#71717A`) to +1 (green `#3F7D58`). Reason: the colors are dialed down from default red/green to read as 'considered' rather than 'alert.'"
> - "Evidence cards are flat, not bordered. Reason: density on the dashboard matters more than separation, and the source link + timestamp do enough visual grouping."

