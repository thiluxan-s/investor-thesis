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

**Paragraph drafting (Phase 6a):** The claims step (step 2) gains a **segmented "Write manually" / "Start from a paragraph" control** that mirrors the step-1 Long/Short direction toggle — same `inline-flex overflow-hidden rounded-lg border border-zinc-200`, same `bg-primary text-primary-foreground` active state / `text-zinc-500` inactive (padding dialed tighter, `px-3.5 py-1.5`, for the longer labels in a denser context). The two modes feed the **same shared `claims` list** so they read as one flow, not a bolted-on tab. At the 5-claim cap both modes collapse to the existing "Maximum of 5 claims" note.

Paragraph mode renders **`ParagraphDrafter`** — a **review-and-add** pattern, not a blind merge: a textarea (2000-char cap, live counter) with a "Draft claims" CTA **gated until 30 characters**; on submit the drafter agent returns candidate claims that **animate in** (Motion, index-staggered fade/rise) as flat `zinc-100` cards. Each card keeps the same badge → statement → muted excerpt hierarchy as a real claim card, plus a **muted italic source excerpt** (`from: "…"`, `text-[11px] text-zinc-400`) so the user can see which of their words produced it, and a **per-claim Add** button (`size="xs"` outline) that pushes that one claim into the shared list and flips to "Added"; it disables once added or at the ≤5 cap. A **vague/empty paragraph** returns no claims and shows a calm inline note ("Couldn't draft claims from that — add more detail, or write them manually.") on a `zinc-50` ground — no error styling, since an unproductive paragraph isn't a failure.

### Thesis health surfaces (Phase 4b)

**Goal:** Read a claim's or thesis's standing at a glance, honestly — strong/weak without "alert," and never a fabricated score for something the agent hasn't evaluated.

**HealthBar (`components/agent/HealthBar.tsx`):** a centered **−1..1** track (center tick, zinc-100 rail) whose fill grows right for positive scores, left for negative, colored by tone. Tone is decided by a **±0.15 neutral deadband** (`HEALTH_DEADBAND`) so a barely-positive score reads neutral zinc rather than glowing green — `bg-health-strong` / `bg-health-neutral` / `bg-health-weak`. The trailing value is **signed, two-decimal, Geist Mono** (`formatHealthScore`, true U+2212 minus), tinted to match the tone. When a claim/thesis has never been analyzed (gated on a real `healthUpdatedAt` / `currentHealthUpdatedAt` timestamp, never on a score of 0) it shows a **dashed "Not analyzed"** track instead — the honest empty state carried over from the Phase 2 placeholder. Track width is per-surface (`w-20` dense list rows, `w-28` detail summary).

**Trace verdict tags (`components/agent/trace/EvidenceCard.tsx`):** each evaluator verdict on an evidence card is a compact `claim N` row — **impact dot + label** (`strengthens` green / `neutral` zinc / `weakens` brick, via the same health tokens) and a **bare two-decimal confidence** in Geist Mono. Confidence is a 0..1 magnitude, so it is rendered unsigned (`toFixed(2)`), deliberately *not* with the signed `formatHealthScore` used for health scores. Reasoning is tucked into a native `<details>` (keeps the card a server component, no JS) and revealed by a **chevron that rotates on `group-open`** — shown only when reasoning exists.

**HealthChart (`components/theses/HealthChart.tsx`):** an overall-health trend line (Recharts, `"use client"`) in the **accent blue `#1E3A5F`**, on a fixed **−1..1 domain** with a **zero reference line** so up/down reads against a stable baseline. Axis ticks are quiet zinc; the tooltip formats to two decimals. With **fewer than 2 snapshots** it shows a dashed placeholder ("Run analysis over time to see the trend") rather than a misleading single point. Recharts SVG props take raw hex (no Tailwind classes) — the values mirror the accent and zinc tokens.

### Settings & last-analyzed (Phase 5b)

**Goal:** Give the digest and ad-hoc-run controls a quiet, sectioned home, and surface when each thesis was last touched without competing with health.

**`/settings` layout:** a single narrow column (`max-w-2xl`) — settings is a sparse form surface, not a data surface, so generosity over density applies. Two sections (**Notifications**, **Analysis**), each headed by the shared section label (`text-[11px] font-semibold uppercase tracking-wider text-zinc-400`, matching the detail-page rail). Each setting is a **label+description / control row**: the title (`text-sm font-medium text-zinc-800`) and a `text-xs text-zinc-500` description sit left, the control right-aligned, separated from the heading by a single `border-zinc-100` hairline. Flat over carded — no `<Card>` chrome, whitespace and one hairline do the grouping.

**Header gear (`app/(app)/layout.tsx`):** a Lucide `Settings` icon link to `/settings` sized to the wordmark mark (`size-[18px]`), grouped in the same right-hand cluster as the Clerk `UserButton` (`gap-4`). Quiet zinc-400 → zinc-700 hover, so it reads as utility chrome, not a primary nav item.

**DigestToggle (`components/settings/DigestToggle.tsx`):** a real `role="switch"` (not a checkbox) — track `bg-primary` (accent) when on / `bg-zinc-200` off, white knob that slides. Toggling is **optimistic** (state flips immediately, transition pending) and **reverts with an error toast** if the server action fails — the control never sits in a fake-success state.

**Last analyzed (`lib/format/relative-time.ts`):** a coarse relative label ("just now", `Nm/Nh/Nd/Nw ago`) appended to the existing zinc meta line on list rows (`ThesisRow`) and the detail header — "· Analyzed Nd ago", or **"Not analyzed"** when no run has completed. Coarse buckets on purpose (this isn't a precise timestamp surface), and the never-run wording stays consistent with the Phase 4b health "Not analyzed" placeholder rather than inventing a second empty phrasing.

### Demo path (Phase 6b)

**Goal:** A recruiter clicks "Try the demo" and lands on what reads as the *real* product — a fully-populated thesis with a live, inspectable agent trace — with no sign-up. The demo's only job visually is to be indistinguishable from the authenticated dashboard except for one calm banner.

**Public routes (`app/demo/`, outside the `(app)` auth group):** `app/demo/page.tsx` (dashboard) and `app/demo/runs/[runId]/page.tsx` (trace) reuse the **same components and layout** as the authenticated detail/trace pages — identical typography hierarchy, the same `grid-cols-[1fr_280px] gap-8` split, the same zinc/deep-blue tokens, `HealthBar` / `HealthChart` / `RunHeader` / `IterationCard` / verdict mapping. They drop only the write affordances (no Analyze-now, edit, delete, status select, notes, drafter) and the auth-only chrome (`PollWhileRunning`, the failed-run banner — demo runs are terminal). Because they sit outside `(app)/layout.tsx` they carry **no app header**; the `DemoBanner` is the page's only chrome (a deliberate "kept the spotlight on the thesis" call — revisit in 6c if the demo needs a wordmark for orientation).

**Read-only by construction, not by flag:** the visitor is unauthenticated and every mutation server action is `requireUserId` + ownership-scoped, so there is nothing to mutate — the demo pages simply render no write UI. The `getDemoRun` scope guard (`lib/demo/scope.ts` `scopeToDemo`) returns `null` for any run whose `thesisId !== DEMO_THESIS_ID`, so `/demo/runs/<any-other-id>` 404s rather than leaking a real user's run.

**`DemoBanner` (`components/demo/DemoBanner.tsx`):** calm utility chrome — `rounded-xl border-zinc-200 bg-zinc-50` with "You're viewing a live demo thesis — read-only" and a primary "Sign up to track your own" button. Same banner on the dashboard and the trace; the trace adds a quiet "← Back to the demo thesis" link.

**`DemoClaimList` (`components/demo/DemoClaimList.tsx`):** a read-only mirror of the real claim cards — same `border-b` density, mono index, `CategoryBadge`, and `HealthBar` — minus every edit affordance, so it renders without importing the editable client-side `ClaimList`.

**Seeded trend, real trace:** the chart shows a genuine multi-week decline (0.55 → 0.40 → 0.20 → 0.00) from **backdated snapshots**, while the trace, evidence, and evaluator verdicts are **real output from the fixtured pipeline** — the demo never fakes the reasoning, only the passage of time.

**Landing CTA (`app/page.tsx`):** a secondary `variant="outline"` "Try the demo" button beside the primary "Create your thesis", with a "No sign-up required" helper — the demo's headline selling point. (Full hero visual polish is 6c.)

### Landing polish (Phase 6c)

**Goal:** The landing page reads as a senior portfolio piece in ~10 seconds and makes "Try the demo" irresistible — by showing the *actual* product UI, not a screenshot.

**Hero (refined):** the structure (eyebrow → headline → lede → two CTAs) is unchanged; the right column's hand-built `ClaimPreview` card is replaced by a **browser-framed live dashboard**. The entrance is still the existing `animate-rise` stagger (the frame is above the fold, so it animates on load with the same `240ms` delay).

**Product showcase — "Watch the agent think":** a second section (`border-t`, asymmetric `lg:grid-cols-[0.9fr_1.1fr]`, generous `py-20`) pairs a short eyebrow + `text-3xl` heading + lede with a **browser-framed agent-trace** — the differentiator. It mirrors the hero's grid language at a flipped weight so the page has rhythm without repetition.

**`BrowserFrame` (`components/landing/BrowserFrame.tsx`):** a server component (Next `Link` works server-side, so no client cost) — subtle chrome (three zinc traffic-light dots + a mono `thesistracker.app/demo` URL pill + a `group-hover` "Open demo →" hint) over a layered product-shot shadow that matches the old hero card's shadow and deepens on hover. **The whole frame is a `Link href="/demo"`** — clicking the "screenshot" opens the real demo.

**Live components, not screenshots:** the frames render the app's **real pure components** — `ShowcaseDashboard` reuses `HealthBar` / `HealthChart` / `CategoryBadge`; `ShowcaseTrace` is a faithful static rebuild using the trace's own tokens (numbered spine, mono tool-call chip, evidence card with `border-l-health-strong`, verdict dots + `tabular-nums` confidence — byte-identical to `EvidenceCard`'s `IMPACT_STYLE`). Data is **in-file typed constants** (`components/landing/showcase-data.ts`) mirroring the seeded NVDA demo (declining-then-recovering trend, one weakening claim). The landing page stays a **static Server Component — no DB, no auth**; the real, interactive version is one click away at `/demo`.

**Motion:** one tasteful below-the-fold moment — the trace frame fades/rises in via a tiny client `Reveal` (`motion/react` `whileInView`, once). The hero frame keeps the CSS `animate-rise`.

**Trace = faithful rebuild, not component reuse:** `ShowcaseTrace` rebuilds the iteration markup rather than importing the real `IterationCard`/`EvidenceCard`, because those require full DB-row types (`AgentRunIteration`, `Evidence`) that would be brittle to hand-fake on a static page. It drops the real card's interactive `<details>` expander (no reasoning to expand in the showcase) and otherwise matches the real tokens exactly.

### Challenge surfaces (Phase 7b)

**Goal:** Trigger and surface a "challenge" run — the agent hunting for evidence against the thesis — without it reading as an alarm, and without letting the UI imply a verdict the evaluator hasn't reached.

**A first-class `--challenge-*` token, not a one-off hex.** The palette (foreground `#8a5a3b`, badge bg `#f4f1ee`, panel bg `#fcfbfa`) is wired the same way as the health colours — CSS variables in both the light and dark blocks of `app/globals.css`, exposed through `@theme inline` as `--color-challenge-foreground` / `--color-challenge-badge` / `--color-challenge-panel`, consumed as Tailwind classes (`text-challenge-foreground`, `bg-challenge-badge`, `bg-challenge-panel`) in `lib/agent/run-mode.ts` and `ChallengeBrief`. **It is deliberately not the brick `--health-weak` pair.** Brick means *weakening evidence* on this app; a challenge run that finds nothing and concludes "the thesis held up" would then wear a weakening-coloured badge, misreading a mode as a verdict. The colour marks which kind of run this is, not what it found — same reasoning as the allow-list-refusal brick precedent, just for the opposite case (a colour that must stay verdict-neutral rather than one that signals a specific outcome).

**Brief sits above the iteration timeline.** Conclusion first, working shown below it — the recruiter reads the case (or the "held up" result) before they'd scroll into the trace that produced it. Mirrors how the sticky `RunHeader` already puts status ahead of detail.

**Trigger is a secondary outline `Button`, not a menu item or a primary action.** `ChallengeButton` sits beside "Analyze now" as an occasional, deliberate action a user reaches for — not the default path (that's still the primary "Analyze now"), and not buried in an overflow menu, since it's a first-class mode worth surfacing directly. The confirmation `AlertDialog` sets expectations ("may find nothing — that is a real result, not a failure") before the run starts.

**"No counter-evidence found" is a result, not an empty state.** The researcher prompt explicitly permits "the thesis held up" as a correct challenge outcome, so `NoChallengeBrief` states it plainly rather than apologizing for finding nothing — no illustration, no "nothing here yet" phrasing.

**Naming: "Challenge," never "bear case."** For a short position the counter-case argues the stock rises — "bear case" would be backwards. "Challenge" names the run's *function* (arguing against the thesis) independent of position direction, and the brief itself never recommends an action; it only lays out the case.

**Design-pass revisions (this section was drafted in the plan, then corrected in front of the running screens):**
1. Promoted the three hex literals to the `--challenge-*` tokens above, rather than leaving them as inline hex in `run-mode.ts` and `ChallengeBrief` — consistent with how every other semantic colour in the app is wired, and it gave the dark-mode variants a home.
2. The brief's `<h2>` was `text-[17px]`, one pixel off `RunHeader`'s `text-lg` (18px) title — not enough difference to read as hierarchy. Dropped to `text-base` (16px) so it's unambiguously subordinate to the run title; weight and colour, not size, carry the brief's own prominence (principle 3, "type does the work").
3. `text-[17px]` and `text-[15px]` were arbitrary values off Tailwind's scale. Replaced with `text-base` / `text-sm`; `text-[11px]` was left alone since it's an established convention across the trace components already.
4. `NoChallengeBrief` was a bordered card for three lines stating an outcome — a border it hadn't earned (principle 2, "flat over carded"; principle 3, "borders do the least work"). Made it flat: no border, no background, separated from what's above it by a single hairline top rule plus spacing. `ChallengeBrief` itself had both an outer card border and an inner `border-t` above its points list — two borders in one small component. Kept the outer card (it's a genuine block of analysis) and let spacing alone separate the summary from the points.
5. The brief appeared with no entrance on a page built around Motion-driven reveals (`IterationCard` fades/springs in as polling discovers new iterations). Gave both `ChallengeBrief` and `NoChallengeBrief` the same restrained entrance (`opacity`/`y` fade via `motion/react`, no per-point stagger — one moment, not a cascade), matching `IterationCard`'s treatment rather than inventing a new one. This makes `ChallengeBrief.tsx` a client component (`"use client"`) — an acceptable cost for a presentational leaf, the same trade `IterationCard` already makes; the trace *page* stays a Server Component, data fetching unchanged.

### Hardening (Phase 6d)

**Goal:** Every screen works on a phone, loads gracefully, and degrades calmly — production-quality, not a desktop prototype.

**Mobile (mobile-first responsive):** the protected app + demo surfaces were desktop-only. Strategy: base = stacked, breakpoint restores the desktop layout — the thesis detail and demo dashboard go `grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]` (claims first, rail below on phones). `RunHeader`'s dense meta row gains `flex-wrap` so the five stats don't overflow narrow screens. `ToolCallBlock` was already mobile-safe (`truncate` preview + `overflow-x-auto` expand). Desktop rendering is unchanged.

**Loading skeletons (not spinners):** a shared `Skeleton` (`components/ui/skeleton.tsx`, `animate-pulse rounded-md bg-zinc-100`) backs route-level `loading.tsx` for the slower reads — theses list, thesis detail, run trace — each skeleton matching its page's real layout (rows / two-column / timeline) so the load→content swap is seamless. `/settings` and `/theses/new` are form surfaces and skip it.

**Branded boundaries:** `app/(app)/error.tsx` (client, the only one that must be) renders a calm "Something went wrong" + "Try again" (`reset()`) + "Back to theses", with a brick-accented icon chip mirroring the 0-theses empty-state chip — and never prints the `error` (no internal leakage). `app/not-found.tsx` is a branded 404 (mono `404` eyebrow → heading → "Back home"), hit by every `notFound()` including the demo scope guard. Both are calm-not-alarming, matching the tool-error tone.

**No-new-evidence empty state:** a run can finish successfully yet collect nothing. Gated on `isTerminalStatus(status) && status !== "failed" && evidenceCollected === 0`, the trace shows a quiet zinc note ("This run finished without finding new evidence.") and `AgentRunPanel` a muted "No new evidence this run" — distinct from the failed-run red box, consistent with the existing quiet-meta convention.

**Accessibility (targeted, not a full WCAG audit):** focus-visible rings (deep-blue `primary`, matching shadcn) on the custom controls that lacked them — the landing `BrowserFrame` link, the `DigestToggle` switch, and both new-thesis segmented controls (`ring-inset`, since they sit inside bordered containers). Icon-only controls already carry `aria-label` (e.g. the header gear), decorative spans are `aria-hidden`, and the `DigestToggle` is a real `role="switch"`. Contrast spot-check: `text-zinc-400` is below AA on white, but it is used only for deliberately-quiet secondary/decorative meta (a standing design decision) with no body-critical text depending on it, so it is left as-is rather than bumped app-wide.

---

## Decisions log

Newest first. Capture meaningful choices with one-sentence rationale.

- **2026-08-19 — Challenge colour promoted to a first-class `--challenge-*` token, wired like the health colours.** Deliberately not the brick `--health-weak` pair — brick means weakening evidence, and a "thesis held up" challenge run would then wear a weakening-coloured badge; the colour marks run *mode*, not verdict.
- **2026-08-19 — Challenge brief design pass:** headline dropped from `text-[17px]` to `text-base` so it reads clearly subordinate to the run title; off-scale `text-[15px]` also moved to the scale; `NoChallengeBrief` made flat (hairline + spacing, no card) since three lines stating a result don't earn a border; `ChallengeBrief`'s redundant inner `border-t` above the points list removed in favor of spacing; both brief states now get the same restrained Motion entrance as `IterationCard`, making `ChallengeBrief.tsx` a client component.
- **2026-06-20 — Mobile-first responsive (base stacked, `lg:` desktop), desktop rendering unchanged.** App + demo two-column grids stack on phones; only the offending fixed grids/rows were touched.
- **2026-06-20 — Skeletons (not spinners) for the slower routes** (list/detail/trace) via a shared `Skeleton`, each matching its page layout for a seamless swap.
- **2026-06-20 — Branded `error`/`not-found` boundaries that never leak internals.** `app/(app)/error.tsx` (client, calm "Something went wrong" + retry) and a branded root `app/not-found.tsx`; the error body never prints the caught `error`.
- **2026-06-20 — "No new evidence this run" empty state** gated on `terminal && !failed && evidenceCollected === 0`, distinct from the failed-run red box and consistent with the quiet-meta convention.
- **2026-06-20 — A11y pass is targeted, not a full WCAG audit:** focus-visible rings on custom controls; `text-zinc-400` quiet meta deliberately kept (no body-critical text depends on it) rather than bumped app-wide.
- **2026-06-20 — Landing product showcase = live prop-driven components in a `BrowserFrame`, not screenshots.** Reuses the real `HealthBar`/`HealthChart`/`CategoryBadge` + in-file typed constants, kept DB-free on a static Server Component; crisp at any resolution, never goes stale, and the whole frame links to the real `/demo`.
- **2026-06-20 — The landing trace is a faithful rebuild (`ShowcaseTrace`), not a reuse of `IterationCard`/`EvidenceCard`.** Those need full DB-row types that would be brittle to fake; the rebuild matches the trace's visual tokens exactly and drops only the interactive `<details>` expander.
- **2026-06-15 — The demo = public read-only routes + a sentinel demo user, not a shared signed-in account.** Read-only is structural (unauthenticated visitor + ownership-scoped mutations), so no per-account read-only flag is needed; the `scopeToDemo` guard stops `/demo/runs/[id]` from leaking another user's run.
- **2026-06-15 — Demo pages reuse the authenticated components/layout verbatim** so the demo reads as the real product; the only "demo" tells are the `DemoBanner` and the absence of write controls.
- **2026-06-15 — Demo data is re-seedable via the fixtured pipeline** (one real run → real trace/verdicts) plus backdated snapshots for the chart trend — real reasoning, only the history's timing is seeded.
- **2026-06-15 — Drafter = third one-shot agent** (Opus 4.8, forced `return_drafted_claims` tool, fixture-backed) that *structures* the user's words into candidate claims and does **not** judge their validity — that stays the evaluator's job, keeping the three roles cleanly separated.
- **2026-06-15 — Paragraph claims use a review-and-add UX, not a blind merge.** Drafted cards keep the source excerpt visible and let the user pick which claims land (per-claim Add into the shared ≤5 list) — the user stays in control of what becomes their thesis.
- **2026-06-15 — `/settings` = single narrow column, sectioned label+description rows.** Flat over carded; section labels reuse the rail's uppercase-tracked zinc-400 style, one hairline per heading, controls right-aligned.
- **2026-06-15 — Settings reached via a quiet header gear** grouped with the Clerk user button — utility chrome, not primary nav.
- **2026-06-15 — DigestToggle = real `role="switch"`, accent track when on, optimistic + revert-on-error.** Never shows a fake-success state if the server action fails.
- **2026-06-15 — "Last analyzed" = coarse relative label on list rows + detail header**, "Not analyzed" for never-run — reuses the Phase 4b health empty-state wording rather than a second phrasing.
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

