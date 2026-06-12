# Thesis Tracker

**An AI agent that watches the world for evidence that strengthens or weakens your investment thesis.**

You write a position you hold and the specific claims behind it. A research agent then runs on a schedule, autonomously gathers fresh evidence from the web (news, SEC filings, company communications), and a separate evaluator judges each piece against each claim. Over time you get a "thesis health" view — with full citations and an inspectable trail of the agent's reasoning.

Thesis Tracker is a *reasoning* tool, not a recommender. It never tells you to buy or sell — it tracks the thesis you already hold and helps you notice when the world stops agreeing with it.

> Portfolio project. It's the agentic-AI companion to [Wayfare](https://github.com/thiluxan-s/TravelApp): where Wayfare does bounded one-shot AI extraction (PDF → JSON), this one runs a real agent loop — plan → tool use → evaluate → repeat → structured output.

---

## Status

**Phase 1 — Foundation (current).** What's live today:

- Next.js 16 (App Router) app deployed on Vercel.
- Clerk authentication: sign-in / sign-up, protected app routes, a user synced to the database on sign-up (via webhook in production, lazy creation locally).
- Neon Postgres with `pgvector` enabled, accessed through Drizzle ORM behind a repository layer.
- A landing page and the (currently empty) `/theses` dashboard shell.

What's coming next:

- **Thesis & claim CRUD** — create, edit, and delete theses with their claims.
- **The researcher agent** — a hand-written tool-use loop (web search, web fetch, SEC EDGAR) that gathers evidence, with every iteration stored and inspectable.
- **The evaluator** — a separate model that scores each (claim, evidence) pair as strengthening / neutral / weakening.
- **Scheduling & weekly email digests.**
- **Paragraph-to-claims drafting** and a final design pass.

## Live demo

_Deploying — link will appear here once the Vercel deployment is live._

---

## Architecture in one line

Three clearly separated AI roles — a **researcher** that runs a hand-written agent loop to gather evidence, an **evaluator** that judges evidence against claims, and a **drafter** that structures a user's free-text reasoning into claims — with the loop written by hand (no agent framework) so every step is transparent and inspectable. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix, new-york, zinc) |
| Database | Neon Postgres + `pgvector`, Drizzle ORM |
| Auth | Clerk |
| AI | Anthropic API, hand-written tool-use loop (no framework) |
| Background jobs | Inngest _(from Phase 5)_ |
| Email | Resend _(from Phase 5)_ |
| Validation | Zod (env, inputs, tool schemas, AI outputs) |
| Hosting | Vercel |

## Local development

Requires **Node 22** (see `.nvmrc`).

```bash
nvm use            # Node 22
npm install
cp .env.example .env.local   # then fill in Neon + Clerk values
npm run db:migrate           # apply migrations (creates pgvector + users)
npm run dev                  # http://localhost:3000
```

Useful scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run db:generate # generate a migration after editing the schema
```

Locally, a signed-in user's database row is created lazily on the first protected
request, so you don't need to expose the Clerk webhook during development.

## Project structure

```
app/                 # App Router: landing, (auth) pages, (app) protected area, API routes
components/ui/        # shadcn/ui components
lib/
  db/                # Drizzle schema, client, and repositories
  clerk/             # webhook event dispatch + lazy user creation
  env.server.ts      # server env (Zod-validated, server-only)
  env.client.ts      # public env (Zod-validated)
drizzle/             # generated migrations
docs/                # PRD, architecture, data model, design, phase plans
```
