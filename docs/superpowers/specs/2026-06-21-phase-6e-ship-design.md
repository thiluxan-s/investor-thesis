# Phase 6e — Ship (design spec)

**Date:** 2026-06-21
**Status:** Approved (design); ready for plan
**Branch:** `phase-6e-ship`

## Goal

Make the repo and the live URL present as a finished senior portfolio piece. No new
product features and no schema changes — this is the "polish the front door" phase:
an accurate README, branded link previews and favicon, and a documented path for the
user to seed the production demo.

Live URL: `https://investor-thesis.vercel.app` (already deployed).
Demo path in prod is currently **unseeded** → `/demo` 404s until the user runs the seed.

## Scope decisions (locked in brainstorm)

- **README imagery:** Mermaid architecture diagram + live demo link only.
  **No demo video, no static screenshots** (may add later).
- **Favicon:** delete the default boilerplate `app/favicon.ico` (25KB Next default) and
  replace with a generated `app/icon.tsx` so the branded mark wins.
- **Prod-seed command** lives in the README deployment section with a
  `<your-prod-database-url>` **placeholder** — the real connection string is never committed.

## In-repo deliverables (I build, subagent-driven)

### 1. README rewrite (`README.md`)

Replace the stale "Phase 1 — Foundation (current)" content. New structure:

- **Title + one-liner**, and the Wayfare contrast (bounded one-shot AI vs. a real agent loop).
- **Live demo** — link to `https://investor-thesis.vercel.app/demo` with a "no sign-up
  required" call-out; link to the app root for the full signed-in experience.
- **Architecture** — a **Mermaid diagram** (GitHub renders it natively) showing:
  the scheduled/ad-hoc trigger → Inngest → the hand-written researcher loop (tools:
  web-search, web-fetch, edgar) → evaluator (one-shot) → health snapshot → digest;
  with the drafter shown on the thesis-creation path. Call out the three/four separated
  agent roles and the extension seams (tools dir, agents dir). Link to `docs/ARCHITECTURE.md`.
- **Design decisions** — the high-value section for senior reviewers. Named choices +
  one-line trade-off each: hand-written loop (not LangChain), three separated agents
  (not one mega-prompt), drafter preserves the user's own reasoning, pgvector (not a
  separate vector DB), deterministic health math (not AI-scored aggregation), weekly
  schedule (not real-time), forced-tool structured outputs + Zod validation, fixtures
  for dev to avoid burning tokens.
- **Tech stack** — concise list matching the locked stack.
- **Local development** — clone, env (`cp .env.example .env.local`), `USE_AI_FIXTURES=1`,
  `npm run dev`, `npm run typecheck`, `npm test` (Node 22 note), Drizzle migrate.
- **Deployment / seeding the demo** — the exact prod-seed one-liner with placeholder:
  ```
  USE_AI_FIXTURES=1 DATABASE_URL="<your-prod-database-url>" \
    node --conditions=react-server --env-file=.env.local --import tsx scripts/seed-demo.ts
  ```
  Note that the shell `DATABASE_URL` overrides `--env-file`; `.env.local` supplies the
  other Zod-validated secrets; the seed only needs `DATABASE_URL` + `USE_AI_FIXTURES`.
- **What I'd build next** — short v2 roadmap (drafter streaming UX, multi-ticker theses,
  source-credibility weighting, alerting on sharp health drops, etc.) drawn from the PRD.

### 2. OG image (`app/opengraph-image.tsx`)

- `next/og` `ImageResponse`, 1200×630, code-generated (no committed binary).
- Brand language: light surface, deep-blue (`#1E3A5F`) mark + "Thesis Tracker" wordmark,
  tagline, and a small health-bar motif using health-strong `#1F7A4D` / health-weak
  `#C0492F`. Uses the runtime-default font stack (no custom font fetch) to keep it simple
  and fast.
- `app/twitter-image.tsx` re-exports the same image (or a thin re-export) so Twitter/X
  cards match. (If a re-export is awkward in the App Router, duplicate the minimal route.)

### 3. Branded favicon (`app/icon.tsx`)

- `next/og` `ImageResponse`, small (e.g. 32×32 or the Next icon default), the deep-blue
  rounded-square mark matching the wordmark glyph.
- **Delete `app/favicon.ico`** so the generated icon is the one served.

### 4. Metadata (`app/layout.tsx`)

- Add `metadataBase: new URL("https://investor-thesis.vercel.app")`.
- Add `openGraph` (title, description, url, siteName, type) and `twitter`
  (`card: "summary_large_image"`, title, description). These pick up the
  `opengraph-image`/`twitter-image` routes automatically.
- Keep existing `title`/`description`; `icons` resolves automatically from `app/icon.tsx`.

## User's manual steps (documented, not executed — I can't reach prod secrets)

1. **Seed the prod demo** with the command above against the prod Neon DB.
2. **Verify**: visit `/demo` live; share the URL somewhere that renders OG cards
   (or use a card validator) to confirm the preview image + title.

## Out of scope

- Demo video, static screenshots (descoped).
- Custom domain (optional, not needed).
- Any new feature, route behavior change, or schema/migration.

## Testing / done

- `npm run typecheck` passes; `npm run lint` clean.
- `app/icon.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx` render locally
  (hit the routes in dev / build succeeds).
- README reads correctly on GitHub (Mermaid renders); links resolve.
- No unit tests (static content + image routes).
- User has approved each diff before commit (strict approval workflow).
