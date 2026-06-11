# Phase 1 — Foundation

**Goal:** A deployed Next.js 15 app where I can sign in via Clerk and see an empty `/theses` dashboard. Database connected (with pgvector enabled). Env split between server and client. No agent features yet.

**Out of scope this phase:** Theses, claims, agent runs, AI calls, Inngest, Resend. Don't get ahead.

> **Before executing this phase:** let the Superpowers brainstorming/planning skills do their job. This doc is the spec to refine, not a script to run line-by-line. The plan should turn this into a concrete task list with checkboxes, using current library versions (verify via Context7).
>
> **Approval workflow reminder:** pause for my approval before every `git add` / `git commit`. No exceptions, including doc and scaffold commits.

## Lessons from Wayfare to apply from the start

A few things we learned the hard way in Wayfare; bake them in now:

- **Env file split.** Create `lib/env.server.ts` AND `lib/env.client.ts` from day one. The single-file approach causes problems when client components want any public env var.
- **Repository pattern from day one.** Even with just a `users` table, put the queries in `lib/db/repositories/users.ts`.
- **Lazy user creation in the `(app)/` layout** as a webhook fallback. Local dev shouldn't need ngrok. Idempotent insert handles the race.
- **Webhook returns `200` with `{ ignored: true }` for unsubscribed event types.** Not `400`. Reserve 4xx for actually-bad input.
- **README written for the deployed project, not the empty scaffold.** Even Phase 1's README should look like a real project description, not a TODO list. (We learned this when Wayfare's README still said "Phase 1 remaining: ...")

## Deliverables

1. Next.js 15 app scaffolded with TypeScript strict mode and Tailwind.
2. shadcn/ui initialized; base components installed: Button, Card, Input, Label, Sonner toaster.
3. Clerk configured: sign-in page, sign-up page, middleware protecting `app/(app)/*`, top nav with `<UserButton />`.
4. Neon database provisioned, pgvector extension enabled, Drizzle wired.
5. `users` table migrated.
6. Clerk webhook (`/api/clerk/webhook`) with Svix signature verification; creates User on `user.created`, updates on `user.updated`, deletes on `user.deleted`, returns `200 { ignored: true }` for anything else.
7. Lazy `ensureUserExists()` helper invoked from the `(app)/` layout as a webhook fallback.
8. Repository pattern set up: `lib/db/repositories/users.ts` with `getUserByClerkId`, `createUserFromClerk`, `updateUserEmail`, `deleteUserByClerkId`.
9. Env validation split: `lib/env.server.ts` and `lib/env.client.ts`, both Zod-validated, app refuses to boot on misconfiguration.
10. `/theses` route renders an empty state ("No theses yet") with a disabled "New thesis" button.
11. Landing page that doesn't look generic — make it look intentional even pre-polish. Should briefly explain the product (agent watches your investment theses, surfaces evidence over time).
12. Deployed to Vercel. Public URL works. Sign-up works. Empty dashboard renders for the signed-in user.
13. **README** with actual current-state description (NOT a phase-by-phase to-do list). Should describe what the project IS, what's deployed today, what's coming. Update the README every phase, not just at the end.

## Folder structure to create

```
.
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── .env.example
├── .env.local                       (gitignored)
├── .gitignore
├── drizzle.config.ts
├── middleware.ts
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── KICKOFF_PROMPT.md
│   ├── superpowers/                 (created by Superpowers — specs, plans)
│   └── phases/
│       ├── phase-1-foundation.md
│       ├── phase-2-thesis-crud.md   (stub)
│       ├── phase-3-agent-loop.md    (stub)
│       ├── phase-4-evaluator.md     (stub)
│       ├── phase-5-schedule-and-digest.md  (stub)
│       └── phase-6-polish.md        (stub)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     (landing page)
│   ├── globals.css
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx               (protected layout, ensureUserExists)
│   │   └── theses/
│   │       └── page.tsx             (empty dashboard)
│   └── api/
│       └── clerk/
│           └── webhook/
│               └── route.ts
├── components/
│   └── ui/                          (shadcn lives here)
├── lib/
│   ├── env.server.ts                (server-only env)
│   ├── env.client.ts                (NEXT_PUBLIC_* env)
│   └── db/
│       ├── index.ts                 (Drizzle client)
│       ├── schema.ts                (users table)
│       └── repositories/
│           └── users.ts
└── drizzle/                         (migrations)
```

## Key implementation details to confirm during planning

- **pgvector extension** needs to be created as part of the first migration. The migration SQL should include `CREATE EXTENSION IF NOT EXISTS vector;` even though no table uses it yet — getting this in the first migration is cleaner than retrofitting later.
- **Project name in package.json:** `thesis-tracker`.
- **Branch convention:** start on `phase-1-foundation`, merge into `main` at phase end.
- **Vercel project name** can be anything; the public domain can be polished later.
- **Clerk webhook secret** stays as `placeholder` until after Vercel deploy (then we configure the production webhook endpoint).

## Acceptance criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` clean.
- [ ] `npm run dev` boots; `localhost:3000` shows the landing page.
- [ ] Signing up creates a User row in Neon (webhook in production, lazy creation locally).
- [ ] Signed-out user visiting `/theses` is redirected to sign-in.
- [ ] Signed-in user at `/theses` sees the empty dashboard.
- [ ] Deployed to Vercel; all of the above works on the production URL.
- [ ] No secrets in the repo. `.env.example` lists all required vars.
- [ ] README accurately describes the current state of the project — not "this is what will be built" but "this is what's deployed and this is what's coming."

## Definition of done

I push the deploy link to myself, sign up with a new email, see the empty dashboard, and close the laptop satisfied that the foundation is real — *and the README on GitHub matches what's actually deployed*.

---

> **Next phase (preview, not now):** Thesis + Claim CRUD. We'll create/edit/delete theses with their claims, see them on the dashboard, but with no agent runs yet — that's Phase 3.
