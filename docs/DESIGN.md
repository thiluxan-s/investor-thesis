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

### Color palette (finalized Phase 1 — "Direction A")

- **Neutrals:** **Zinc**, full range (`zinc-50` → `zinc-950`). The shadcn zinc theme provides the base CSS variables (`--background`, `--foreground`, `--border`, `--muted`, etc.) in `app/globals.css`.
- **Accent:** **`#1E3A5F`** — deep blue, lower saturation than `blue-700`. Distinct from every default Tailwind blue, reads serious/trustworthy, contrast-safe. Wired as `--primary`.
- **Semantic health colors** (warm/earthy variant "H2", calibrated together so the health bar reads "considered," not "alert"):
  - Strengthening — **`#1F7A4D`** (`--health-strong`, exposed as `bg-health-strong`)
  - Neutral — **`#A1A1AA`** (zinc-400, `--health-neutral`, `bg-health-neutral`)
  - Weakening — **`#C0492F`** (warm brick, `--health-weak`, `bg-health-weak`)

### Typography (finalized Phase 1)

- **Geist Sans** for all UI/body, **Geist Mono** for tickers, health scores, and numeric data. Loaded via the `geist` npm package (self-hosted, no Google fetch) and exposed as `--font-geist-sans` / `--font-geist-mono`, mapped to Tailwind's `font-sans` / `font-mono`.
- **One family + its monospace** — Geist and Geist Mono are designed together.
- **Weight scale:** 400 / 500 / 600. Use all three; lean on 500 for subtle emphasis.
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

**Layout (Phase 1):** Asymmetric split hero — headline + lede + CTA on the left, a static product-preview card (thesis with claim-health bars) on the right, then a 3-step "how it works" strip divided by hairlines (not cards). Light theme. Generous marketing spacing.

**CTA (Phase 1):** Primary CTA is **"Create your thesis" → Clerk sign-up**. "Try the demo" is intentionally **omitted until the demo-seed phase** — the pre-seeded demo thesis doesn't exist yet, so there's no dead/misleading link.

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

- **2026-06-11 — shadcn install method.** Components added by pulling canonical `new-york-v4` source directly from shadcn's registry (`ui.shadcn.com/r/...`), because the 2.x CLI fails against the current registry (`css: Invalid input`) and the 3.x CLI only produces the new Base UI `base-nova` style. We deliberately use classic **Radix** shadcn (`-b radix`, new-york, zinc) for recognizability and the `asChild` API. Add future components the same way (registry fetch) to stay on classic Radix.
- **2026-06-11 — Accent color `#1E3A5F`** (deep blue, lower saturation than `blue-700`). Reason: distinct from every default Tailwind blue, reads serious/trustworthy, contrast-safe.
- **2026-06-11 — Health colors** strengthening `#1F7A4D`, neutral `#A1A1AA`, weakening `#C0492F` (warm "H2" variant). Reason: dialed down from kelly-green/fire-engine-red to read "considered" rather than "alert"; the weakening red leans warm to pair with the deep blue.
- **2026-06-11 — Typeface Geist Sans + Geist Mono** via the `geist` package. Reason: one designed-together family with a monospace for tickers/scores; self-hosted, no Google fetch.
- **2026-06-11 — Design direction "A · Graphite & Deep Blue"** chosen over warm-editorial and near-monochrome alternatives. Reason: Linear-leaning, fintech-credible, restrained.

