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

**Layout (Phase 2):** **Flat rows**, not cards — hairline `zinc-100` separators under a `zinc-200` top border, no per-row card chrome. Honors "flat over carded" + "density on data surfaces"; scales to many theses without the "three cards in a row" look. Each row is a three-column grid: left = ticker pill (`font-mono`, `zinc-100` bg) + Long/Short tag (health-strong green / health-weak brick) + title, with `N claims · {horizon}` meta beneath; middle = the health placeholder; right = status chip (`active` reads in the deep-blue accent, others muted zinc). The whole row is the click target (`<Link>`).

**Health placeholder (Phase 2):** explicit **"Not analyzed yet"** with a dashed empty track — never a fabricated `0.00` score or filled bar. Real health bars replace this in Phase 4.

**CTA:** "New thesis" is the single primary button, top-right, linking to the dedicated `/theses/new` route. The empty state repeats it as "Create your first thesis."

### `/theses/[id]` (thesis detail / dashboard)

**Goal:** This is the main product surface. A user spends 95% of their app time here.

**Layout (Phase 2):** **Two-column** — a wide main column for claims and a 280px right rail for reference + actions. Reasoning: the immutable meta (ticker/position/horizon) reads naturally as a compact rail separate from the editable claims that are the real work, and the rail gives Phase 4's health summary and Phase 3's run *list* a home without a redesign. Header = breadcrumb (`Theses / TICKER`) + title + ticker/direction/horizon badges, with a disabled **"Analyze now"** button carrying an "Available next phase" tooltip.

- **Main column — claims:** each claim is flat (category badge + statement + Edit/Delete), separated by `zinc-100` hairlines. Editing expands the row in place into the shared `ClaimForm` (textarea + category select) — no modal. "+ Add claim" appends a `ClaimForm`; it's replaced by a "Maximum of 5 claims" note at the cap. Deleting the claim that would drop below 2 is blocked with a toast.
- **Right rail:** a bordered meta card (ticker/position/horizon read-only; **status** is an inline editable select), then Notes (click-to-edit, "+ Add notes" when empty), then an "Analysis" section showing the honest "No analysis yet" placeholder, then a quiet "Delete thesis" guarded by an AlertDialog confirmation.

**Future (Phases 3–4):** the agent-run *trace* (the wow moment) needs width and will open full-width (slide-over or sub-route), not in the narrow rail; the rail holds only the run list and health summary.

### Agent run trace view

**Goal:** The wow moment of the entire app. Where a recruiter lingers.

**Layout (Phase 3b):** Full-width **sub-route** `/theses/[id]/runs/[runId]` (linkable, room to breathe), rendered as an **immersive single-column vertical timeline**: a 2px spine with numbered iteration nodes (deep-blue ring); each iteration shows a **Reasoning** block (summarized thinking, label-above-body), its **tool calls** (collapsible — name + mono arg preview, expand for output), then **evidence cards inline** at the iteration that produced them (green left-accent, `claim N` tags). A **sticky header** carries status + ticker + `iterations · evidence · ~$cost · duration`.

**Streaming vs polled (Phase 3b):** the run executes in the background (Inngest); the page polls every ~3s via `router.refresh()`. New iteration cards **spring/fade in** (Motion) as polling discovers them; the active iteration's node **pulses**. Not token-streaming — honest to the no-SSE-in-v1 call, still alive. Initial load uses a gentle index-staggered reveal.

**Tool calls:** collapsed by default (name + truncated mono args visible); expand for the JSON output. **Errors are calm, not alarming** — an allow-list refusal shows a brick `refused` chip + brick-tinted bar (`#C0492F` / `#fbf1ef`), not a red alert.

**Cost:** an estimate from Opus token pricing, shown as "~$X" (clearly approximate), in Geist Mono — the credibility detail.

**Run card (rail, Phase 3b):** the `/theses/[id]` rail "Analysis" slot now hosts the live `AgentRunPanel` (replacing the Phase-2 "No analysis yet" placeholder): latest run as a compact card (status pill with pulse, live `iters · evidence · ~$cost`, relative time, "View trace →"), an earlier-runs disclosure, and the same `router.refresh()` polling while a run is non-terminal. "Analyze now" in the header is now live (disabled while a run is in progress).

### New thesis flow (manual + paragraph)

**Goal:** Two modes feel like one product, not like two separate flows bolted together.

**Manual flow (Phase 2):** A dedicated **`/theses/new` route** (not a modal) chosen so it scales to the Phase 6 paragraph tab + drafter-running state. Two steps: **(1) Position** — title, ticker (`font-mono`, auto-uppercased, 1–6 letters), Long/Short segmented toggle, time-horizon select, status select (Active default; Paused for "still planning"); **(2) Claims** — a live "N of 2–5" counter, added claims shown compact, and the **same `ClaimForm`** used on the detail page for adding the next. "Create" stays disabled until ≥2 valid claims. Notes are intentionally absent from the wizard (editable on detail) to avoid a wall of fields.

> Phase 6 adds the "Start from a paragraph" tab here. Decisions on the tabbed interface, drafter-running state, and drafted-claim review go here when Phase 6 ships.

### Thesis health surfaces (Phase 4b)

**Goal:** Read a claim's or thesis's standing at a glance, honestly — strong/weak without "alert," and never a fabricated score for something the agent hasn't evaluated.

**HealthBar (`components/agent/HealthBar.tsx`):** a centered **−1..1** track (center tick, zinc-100 rail) whose fill grows right for positive scores, left for negative, colored by tone. Tone is decided by a **±0.15 neutral deadband** (`HEALTH_DEADBAND`) so a barely-positive score reads neutral zinc rather than glowing green — `bg-health-strong` / `bg-health-neutral` / `bg-health-weak`. The trailing value is **signed, two-decimal, Geist Mono** (`formatHealthScore`, true U+2212 minus), tinted to match the tone. When a claim/thesis has never been analyzed (gated on a real `healthUpdatedAt` / `currentHealthUpdatedAt` timestamp, never on a score of 0) it shows a **dashed "Not analyzed"** track instead — the honest empty state carried over from the Phase 2 placeholder. Track width is per-surface (`w-20` dense list rows, `w-28` detail summary).

**Trace verdict tags (`components/agent/trace/EvidenceCard.tsx`):** each evaluator verdict on an evidence card is a compact `claim N` row — **impact dot + label** (`strengthens` green / `neutral` zinc / `weakens` brick, via the same health tokens) and a **bare two-decimal confidence** in Geist Mono. Confidence is a 0..1 magnitude, so it is rendered unsigned (`toFixed(2)`), deliberately *not* with the signed `formatHealthScore` used for health scores. Reasoning is tucked into a native `<details>` (keeps the card a server component, no JS) and revealed by a **chevron that rotates on `group-open`** — shown only when reasoning exists.

**HealthChart (`components/theses/HealthChart.tsx`):** an overall-health trend line (Recharts, `"use client"`) in the **accent blue `#1E3A5F`**, on a fixed **−1..1 domain** with a **zero reference line** so up/down reads against a stable baseline. Axis ticks are quiet zinc; the tooltip formats to two decimals. With **fewer than 2 snapshots** it shows a dashed placeholder ("Run analysis over time to see the trend") rather than a misleading single point. Recharts SVG props take raw hex (no Tailwind classes) — the values mirror the accent and zinc tokens.

---

## Decisions log

Newest first. Capture meaningful choices with one-sentence rationale.

- **2026-06-14 — HealthBar = centered −1..1 fill with a ±0.15 neutral deadband.** Fill grows out from center colored by tone, signed two-decimal mono value alongside; barely-positive scores read neutral, not green.
- **2026-06-14 — Unanalyzed health shows a dashed "Not analyzed", never `0.00`.** Gated on a real `healthUpdatedAt` timestamp, not a score — honest about what the agent hasn't touched.
- **2026-06-14 — Trace confidence rendered as a bare two-decimal magnitude**, not the signed `formatHealthScore` — confidence is a 0..1 magnitude, so a leading `+` would mislead.
- **2026-06-14 — Trace verdict reasoning expands via native `<details>` + a `group-open` rotating chevron** — keeps the evidence card a server component (no client JS) while staying inspectable.
- **2026-06-14 — HealthChart = accent-blue line on a fixed −1..1 domain with a zero reference line**, dashed placeholder under 2 snapshots — a stable baseline and no misleading single point.
- **2026-06-13 — Trace view = immersive single-column timeline** (numbered spine, reasoning → collapsible tool calls → inline evidence) at a full-width sub-route. Reads as "watch the agent think," the memorable wow vs a dashboard.
- **2026-06-13 — Live updates = polled incremental reveal, not token-streaming.** `router.refresh()` every ~3s; new cards spring/fade in via Motion; active node pulses. Honest to ARCHITECTURE's no-SSE-in-v1 call.
- **2026-06-13 — Tool errors render calm, not alarming** — brick `refused` chip + tint for allow-list blocks, never a red alert.
- **2026-06-13 — Run cost shown as "~$X"** (Geist Mono) estimated from Opus token pricing — a credibility detail, clearly approximate.
- **2026-06-13 — Motion (framer-motion) adopted** for the trace's reveal animations (one or two thoughtful moments; no gratuitous animation), per the CLAUDE.md reach-for-when-relevant guidance.
- **2026-06-12 — Thesis list = flat rows, not cards.** Density on data surfaces; scales without the "three cards" look.
- **2026-06-12 — Detail = two-column (main claims + 280px right rail).** Rail holds immutable meta + status + notes + analysis placeholder, and scales to Phase 3/4 (run list, health) without a redesign; the agent trace itself opens full-width.
- **2026-06-12 — New-thesis = dedicated `/theses/new` route, not a modal.** Scales to the Phase 6 paragraph tab; multi-step in a modal fights the back button and reads cramped.
- **2026-06-12 — Claim editing = inline via one shared `ClaimForm`.** Reused across wizard, add, and edit; on detail the row expands in place rather than opening a modal. Drag-reordering deferred — `ordinal` is append-order only for now.
- **2026-06-12 — Status enum stays active/paused/closed (no `draft`).** "Still planning, don't run the agent" is exactly `paused`; a 4th status would overlap it for no gain.
- **2026-06-12 — Health placeholder is explicit "Not analyzed yet".** Never a fabricated `0.00` or filled bar; real bars arrive in Phase 4.
- **2026-06-11 — shadcn install method.** Components added by pulling canonical `new-york-v4` source directly from shadcn's registry (`ui.shadcn.com/r/...`), because the 2.x CLI fails against the current registry (`css: Invalid input`) and the 3.x CLI only produces the new Base UI `base-nova` style. We deliberately use classic **Radix** shadcn (`-b radix`, new-york, zinc) for recognizability and the `asChild` API. Add future components the same way (registry fetch) to stay on classic Radix.
- **2026-06-11 — Accent color `#1E3A5F`** (deep blue, lower saturation than `blue-700`). Reason: distinct from every default Tailwind blue, reads serious/trustworthy, contrast-safe.
- **2026-06-11 — Health colors** strengthening `#1F7A4D`, neutral `#A1A1AA`, weakening `#C0492F` (warm "H2" variant). Reason: dialed down from kelly-green/fire-engine-red to read "considered" rather than "alert"; the weakening red leans warm to pair with the deep blue.
- **2026-06-11 — Typeface Geist Sans + Geist Mono** via the `geist` package. Reason: one designed-together family with a monospace for tickers/scores; self-hosted, no Google fetch.
- **2026-06-11 — Design direction "A · Graphite & Deep Blue"** chosen over warm-editorial and near-monochrome alternatives. Reason: Linear-leaning, fintech-credible, restrained.

