# Phase 1 — Foundation: Design Spec

**Date:** 2026-06-11
**Branch:** `phase-1-foundation`
**Status:** Approved design → ready for implementation planning

## Goal

A deployed Next.js 15 app where a user can sign in via Clerk and see an empty
`/theses` dashboard. Database connected with pgvector enabled, env split between
server and client, repository pattern in place. No agent/AI/thesis features yet.

This spec consolidates `docs/phases/phase-1-foundation.md`, the conventions in
`CLAUDE.md`, and the visual decisions made during brainstorming.

## Out of scope (do not build this phase)

Theses, claims, agent runs, AI calls, embeddings, Inngest, Resend. The `users`
table is the only table. The pgvector extension is enabled but unused.

---

## Visual foundation

Finalizes the "TBD — finalize Phase 1" sections of `docs/DESIGN.md`. These
become CSS variables / Tailwind theme tokens in `globals.css` and a decisions-log
entry in `DESIGN.md`.

| Token | Value | Use |
|---|---|---|
| Neutrals | **Zinc** scale, full range (`zinc-50`–`zinc-950`) | All surfaces, text |
| Accent | **`#1E3A5F`** (deep blue, lower-saturation than `blue-700`) | Primary buttons, links, brand mark |
| Health — strengthening | **`#1F7A4D`** | Positive evidence impact |
| Health — neutral | **`#A1A1AA`** (zinc-400) | Neutral evidence impact |
| Health — weakening | **`#C0492F`** (warm brick) | Negative evidence impact |
| Typeface — UI/body | **Geist Sans** | Everything |
| Typeface — numeric/mono | **Geist Mono** | Tickers, health scores, numbers |

**Health colors** are deliberately warm/earthy (not kelly-green / fire-engine-red)
so the dashboard reads "considered," not "alert."

### Landing page layout

**Asymmetric split hero**, light theme:

- Top bar: brand mark (deep-blue rounded square + "Thesis Tracker"), right-aligned
  "Sign in" (ghost) + primary CTA.
- Hero: two-column. Left — eyebrow label (Geist Mono, uppercase), large
  tracking-tight headline, lede (~46ch), CTAs. Right — a static product-preview
  card showing a thesis with two claim health bars and an evidence/last-run line.
  The preview is illustrative markup (not live data) so a recruiter "gets it"
  above the fold.
- Below hero: a 3-step "how it works" strip (Write your thesis → The agent
  researches → Watch the health), divided by hairlines, not cards.

**Primary CTA is "Create your thesis" → Clerk sign-up.** "Try the demo" is
**omitted in Phase 1** — the pre-seeded demo thesis does not exist yet, so no
dead/misleading link. It gets added in the phase that seeds demo data.

Marketing surface breathes (generous spacing); avoids centered-three-feature-cards.

---

## Architecture & file structure

Only what Phase 1 needs (subset of the full project tree in `CLAUDE.md`):

```
app/
  layout.tsx                       # fonts (geist), <ClerkProvider>, Sonner toaster
  page.tsx                         # landing page
  globals.css                      # Tailwind v4 theme tokens (palette above)
  (auth)/
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
  (app)/
    layout.tsx                     # protected; calls ensureUserExists()
    theses/page.tsx                # empty state ("No theses yet", disabled "New thesis")
  api/
    clerk/webhook/route.ts         # Svix-verified Clerk webhook
components/
  ui/                              # shadcn (new-york style, zinc base): Button, Card, Input, Label, Sonner
lib/
  env.server.ts                    # server-only env, Zod-validated at load
  env.client.ts                    # NEXT_PUBLIC_* env, Zod-validated at load
  db/
    index.ts                       # Drizzle client over Neon
    schema.ts                      # users table only
    repositories/
      users.ts                     # all users-table access
middleware.ts                      # clerkMiddleware() protecting (app)/*
drizzle/                           # generated migrations (committed)
```

### Environment validation

- Hand-rolled **Zod** parse in `env.server.ts` and `env.client.ts`. App refuses
  to boot on misconfiguration. **No `@t3-oss/env` dependency** (CLAUDE.md: validate
  with Zod; don't add deps for what Zod already does).
- `.env.example` committed listing all required vars. `.env.local` gitignored.
- Phase 1 vars: `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET` (`placeholder`
  until the Vercel deploy configures the production endpoint), and Clerk's
  sign-in/up URL vars as needed.

### Database

- Neon Postgres + Drizzle. Single `users` table:
  `id` (uuid pk), `clerk_user_id` (text, unique, indexed), `email` (text),
  `created_at`, `updated_at` (both `timestamptz`).
- **First migration includes `CREATE EXTENSION IF NOT EXISTS vector;`** even
  though no column uses it yet — cleaner than retrofitting.
- Migrations workflow: `db:generate` → `db:migrate`, **committed** migrations
  (not `db:push`), so the extension creation is in version control.
- All access through `lib/db/repositories/users.ts`:
  `getUserByClerkId`, `createUserFromClerk`, `updateUserEmail`,
  `deleteUserByClerkId`.

---

## Auth & data flow

Clerk owns identity; we keep a thin `users` row keyed by `clerk_user_id`. Two
creation paths (Wayfare lessons):

1. **Production — webhook.** `/api/clerk/webhook` verifies the **Svix** signature,
   then:
   - `user.created` → `createUserFromClerk`
   - `user.updated` → `updateUserEmail`
   - `user.deleted` → `deleteUserByClerkId`
   - any other event type → **`200 { ignored: true }`** (not 4xx; reserve 4xx for
     genuinely bad input / failed signature verification)
2. **Local dev — lazy fallback.** `ensureUserExists()` runs in the `(app)` layout:
   idempotent insert (on-conflict-do-nothing on `clerk_user_id`). No ngrok needed.

Authorization: `clerkMiddleware()` protects `(app)/*`. Signed-out users hitting
`/theses` are redirected to sign-in.

---

## Dependencies

- New dependency approved this phase: **`geist`** (Vercel's official package
  shipping `GeistSans` + `GeistMono` as `next/font` objects).
- All other deps are the locked stack (Next 15, Tailwind, shadcn/ui, Drizzle,
  `@neondatabase/serverless`, `@clerk/nextjs`, `svix`, `zod`).

## Library-version verification

Exact versions and current API patterns (Clerk `clerkMiddleware`, Drizzle Neon
adapter + `vector` column type, Next 15 App Router specifics, shadcn init for
Tailwind v4) are **verified via Context7 during the planning step** — not pinned
from memory.

---

## Acceptance criteria (from the phase doc)

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` clean.
- [ ] `npm run dev` boots; `localhost:3000` shows the landing page.
- [ ] Signing up creates a `users` row in Neon (webhook in prod, lazy creation locally).
- [ ] Signed-out user visiting `/theses` is redirected to sign-in.
- [ ] Signed-in user at `/theses` sees the empty dashboard.
- [ ] Deployed to Vercel; all of the above works on the production URL.
- [ ] No secrets in the repo. `.env.example` lists all required vars.
- [ ] README describes the current deployed state (not a to-do list).
- [ ] `docs/DESIGN.md` updated with the finalized tokens + landing decision.

## Definition of done

Push the deploy link, sign up with a new email, see the empty dashboard, and the
GitHub README matches what's actually deployed.
