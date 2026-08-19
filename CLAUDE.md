# Thesis Tracker

> **Read these documents in order before starting any task:**
> 1. This file (project context, conventions, principles, workflow)
> 2. `docs/PRD.md` (what we're building and why)
> 3. `docs/ARCHITECTURE.md` (how it fits together — *especially* the Agent Design section)
> 4. `docs/DATA_MODEL.md` (database schema and the reasoning)
> 5. `docs/DESIGN.md` (visual design decisions — required reading before any UI work)
> 6. The current phase doc in `docs/phases/`
>
> If anything in a phase doc contradicts this file, **stop and ask** — don't reconcile silently.

---

## Working with this codebase

When Superpowers skills activate (brainstorming, planning, TDD, debugging, verification), follow them. They are the workflow. This document gives you the *context* those skills consume — not a replacement for them.

Use Context7 to pull current docs for any library before writing non-trivial code against it (Drizzle, Clerk, Inngest, Anthropic SDK including tool use, Resend, Next.js App Router APIs). Library surfaces drift; training-data knowledge of them does not age well.

Use the frontend-design skill for any UI work — not just polish passes. Invoke it on every screen, every component, every page. The skill encodes design tokens, spacing, typography, and aesthetic guardrails that beat what either of us would invent from scratch. Don't deviate from its conventions without flagging the reason.

If a plugin skill and this document conflict on *process* (when to test, how to plan, how to debug), the plugin wins. If they conflict on *project context* (what we're building, the tech stack, the conventions, the data model), this document wins — flag the contradiction so we can update whichever is wrong.

## Approval workflow — REQUIRED

This is a strict rule on this project, different from how Wayfare ran.

**Before staging or committing any code, you must:**
1. Summarize the change in 1-3 sentences: what you changed, why, and the most important thing for me to look at.
2. Show me the relevant diffs (or describe them clearly if they're large).
3. **Wait for my explicit approval** ("approved", "go ahead", "commit it", etc.) before running `git add` or `git commit`.
4. If I push back, address the feedback and re-summarize. Repeat until approval.

This applies to every commit — including documentation updates, dependency installs, and scaffolding. There are no exceptions for "small" changes; small wrong commits are how a portfolio repo grows weird history.

**Why:** the agent layer in this project has more subtle failure modes than Wayfare's PDF parsing. A bad prompt change or a tool-schema mistake can invalidate weeks of agent runs. I want eyes on every change before it lands.

## What this is

Thesis Tracker is a portfolio project: a tool that watches the world for evidence that strengthens or weakens an investor's thesis. The user writes a thesis (a position they hold + the specific claims supporting it). An AI agent runs on a schedule, autonomously gathers new evidence from the web (news, SEC filings, company communications), evaluates each piece against the claims, and updates a "thesis health" view over time.

The audience is hiring managers reviewing my portfolio. The demo lands in under 90 seconds: a recruiter signs in, sees a real thesis with a real trail of evidence and reasoning, and "gets it." Every architectural and UX decision should serve that demo.

This project is the agentic-AI complement to Wayfare (my first portfolio project, which did one-shot AI extraction from documents). Where Wayfare's AI is bounded (PDF in → JSON out), this one's AI is a real loop: plan → tool use → evaluate → repeat → produce structured output. That contrast is intentional and should be visible in the architecture.

## Who I am

I'm Thiluxan, a full-stack developer with 3 years on a production React/TypeScript/Vite EMR app (MobX, Zod, AWS Lambda/DynamoDB), and one shipped portfolio project — Wayfare (https://github.com/thiluxan-s/TravelApp). I'm building this with Claude Code on weekends. I value:

- **Minimal targeted changes.** Follow existing patterns. Don't refactor things that aren't part of the task.
- **Understanding the reasoning** behind every change. If you propose something, explain *why* in one sentence so I can learn from it.
- **Running typecheck before committing.** No exceptions.
- **Wayfare's lessons.** I built Wayfare with the same workflow (Superpowers, plan-then-execute, phased delivery). When in doubt, refer to how that project's `CLAUDE.md`, phase docs, and conventions were structured — this project should feel like a coherent successor, not a clean-slate restart.

## Tech stack — locked in

These are decided. Don't propose swaps without asking.

- **Framework:** Next.js 16 (App Router) + TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Neon Postgres (with pgvector extension) + Drizzle ORM
- **Auth:** Clerk
- **AI:** Anthropic API. Native tool use (not LangChain/Mastra/etc — I want to write the agent loop myself for transparency and interview narrative). Look up current best practices in https://docs.claude.com before committing to specific patterns or model strings.
- **Background jobs:** Inngest (both ad-hoc agent runs and scheduled weekly runs)
- **Email:** Resend (digests in Phase 5)
- **Validation:** Zod everywhere — env vars, API inputs, tool schemas, AI outputs
- **Hosting:** Vercel (Hobby tier — non-commercial portfolio use)

**Deliberately not in the stack and not to be proposed:** LangChain, Mastra, or any other agent framework (we write the loop ourselves); Redis or other caches (premature); GraphQL/tRPC (Server Actions are the API); MobX/Zustand/Redux (Server Components own state); Pinecone/Weaviate/other vector DBs (pgvector is plenty).

## Conventions

### TypeScript
- `strict: true` in tsconfig. No `any`. If you can't avoid it, use `unknown` and narrow.
- Prefer `type` over `interface` unless declaration merging is needed.
- Zod schemas are the source of truth — derive types with `z.infer<typeof Schema>`.
- DB types derive from Drizzle schema via `$inferSelect` / `$inferInsert`.

### File structure
```
app/                          # Next.js App Router pages and route handlers
  (auth)/                     # Public auth pages (sign-in, sign-up)
  (app)/                      # Protected app — Clerk middleware enforces auth
    theses/
    theses/[thesisId]/
  api/
    inngest/route.ts          # Inngest webhook endpoint
    clerk/webhook/route.ts    # Clerk webhook endpoint
components/
  ui/                         # shadcn components (don't edit directly)
  theses/                     # Thesis-specific components
  agent/                      # Agent run trace, evidence cards, health bars
lib/
  db/
    schema.ts
    repositories/             # All DB access goes through repositories
  ai/
    client.ts                 # Anthropic client wrapper
    agents/                   # Each agent role in its own file
      researcher.ts           # the tool loop (research + challenge modes)
      evaluator.ts
      drafter.ts
      summarizer.ts           # Phase 5 — weekly digest blurbs
      challenger.ts           # Phase 7a — the case against a thesis
    tools/                    # Tool definitions for the researcher agent
      web-search.ts
      web-fetch.ts
      edgar.ts
    prompts/                  # System prompts, separate from agent code
    schemas/                  # Zod schemas for tool inputs/outputs and structured AI outputs
  inngest/
    client.ts
    functions/                # One function per file: run-agent.ts, weekly-cron.ts, etc.
  resend/
    client.ts
  env.ts
schemas/                      # Cross-cutting Zod schemas (thesis, claim, evidence, etc.)
docs/
  PRD.md
  ARCHITECTURE.md
  DATA_MODEL.md
  KICKOFF_PROMPT.md
  phases/
  superpowers/                # Created by Superpowers — specs, plans, status
```

### Imports
- Absolute imports via `@/` (configured in tsconfig). Never `../../../lib/...`.
- Group: external → `@/` → relative, blank line between groups.

### Naming
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `kebab-case.ts` for files, `camelCase` for exports
- DB tables: `snake_case` (Drizzle maps to JS)
- Zod schemas: `SomethingSchema`; type as `Something`

### Server vs client components
- Default to Server Components. Only add `"use client"` when state, effects, or browser APIs are genuinely needed.
- Mutations through Server Actions, not API route handlers, unless an external service needs to reach the route (Inngest webhook, Clerk webhook).
- Long-lived data fetching always Server Components; never `useEffect` for data.

### Error handling
- Server Actions return `{ ok: true, data } | { ok: false, error }` — never throw across the boundary.
- AI calls can fail in three ways: API error, malformed response, content that fails Zod validation. Handle each distinctly. Never trust an AI response without Zod validation.
- Background jobs (Inngest) have automatic step retries — let Inngest handle transient failures; don't add manual retry loops inside steps.

### Database
- All schema changes through Drizzle migrations. Never edit migrations after they're applied.
- Every table has `id`, `created_at`, `updated_at`.
- Cascade deletes for owned relationships (thesis → claims → claim_evidence_links, etc.).
- pgvector for evidence embeddings — see `DATA_MODEL.md` for the exact column type.
- All queries go through `lib/db/repositories/`. No raw Drizzle calls in components, server actions, or Inngest functions.

### AI / Anthropic API

This is the highest-value section of this document. Read carefully.

- **Five agent roles, clearly separated.** One loop, four one-shots. "Researcher" (`researcher.ts`) runs a tool loop to gather evidence; it has two modes — `research` gathers evidence bearing on a thesis, `challenge` hunts for evidence against it — and mode selects the prompt pair only, never the loop body. "Evaluator" (`evaluator.ts`) judges whether one piece of evidence strengthens or weakens one claim. "Drafter" (`drafter.ts`) structures a user's free-text paragraph into candidate claims (Phase 6). "Summarizer" (`summarizer.ts`) writes the weekly digest blurbs (Phase 5). "Challenger" (`challenger.ts`) writes the case against a thesis from evidence the evaluator already scored as weakening (Phase 7a). Don't merge them — the separation is intentional. See `ARCHITECTURE.md` for the reasoning.
- **The evaluator is deliberately mode-blind.** It is never told whether evidence came from a research or a challenge run. That is one of three layers stopping challenge mode from inflating its own verdicts (the other two: the prompt permits "the thesis held up" as a correct answer, and the challenger may only cite evidence that survived evaluation). Don't pass `mode` into the evaluator's prompt or its task inputs.
- **The agent loop is hand-written.** No frameworks. The loop lives in `lib/ai/agents/researcher.ts` as a clear `while` loop with explicit stop conditions: max iterations, max tokens spent, model returns final answer, or budget exceeded. Surface every iteration's state (assistant message, tool calls, tool results) for storage so the user can see the trace.
- **Tool definitions are strict.** Every tool has a Zod schema for its input. We validate tool calls against the schema before executing — if Claude returns malformed args (rare but happens), we return a tool error message and let the loop continue rather than crashing.
- **All AI structured outputs use tool use.** Force structured outputs by defining a single "return_result" tool with a Zod-derived schema. Never parse free-form text as JSON when you can avoid it.
- **Prompts live in `lib/ai/prompts/`** — one file per agent. Each prompt file exports `{ systemPrompt, taskTemplate }`. Prompts are *content*, not code logic; keep them out of agent files.
- **Don't burn tokens during development.** Fixture-based testing: cache real AI outputs to `__fixtures__/` and have a `USE_AI_FIXTURES=1` env var that short-circuits the Anthropic call. We're paying real money for these tokens.
- **Logging and tracing.** Every agent run produces a structured trace stored in the DB: the messages sent, tool calls made, tool results received, final output, token usage, duration. The UI shows this trace to the user. This is a *feature*, not a debugging tool — agent runs that you can inspect are the difference between a magic-box demo and a credible-engineering demo.

### Environment variables
- All env vars validated by Zod at startup (`lib/env.ts`).
- Split `env.server.ts` and `env.client.ts` (Wayfare's Phase 2 follow-up — apply it from the start here).
- `.env.example` committed. `.env.local` gitignored.

### Git
- Branch per phase: `phase-1-foundation`, `phase-2-thesis-crud`, etc.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).
- **Always pause for my approval before staging or committing** (see "Approval workflow" above).
- I handle PRs and merges into `main` at phase boundaries.

## Frontend quality bar

The frontend is where this project will be judged most quickly. A senior portfolio piece needs to *look* senior, not just function senior.

### Visual reference, not adjective

The visual quality bar for this app is: **Linear** (linear.app), **Vercel's dashboard** (vercel.com), **Granola** (granola.ai). Not "looks like a Next.js starter." When in doubt, look at those references. "Make this look like Linear" is a more useful instruction than "make this look polished."

Specifically what those references demonstrate:
- Typography has hierarchy and personality — multiple weights, sizes, and tracking working together.
- Spacing is generous and intentional, not uniform 16px gaps everywhere.
- Motion is subtle and purposeful — not absent, not gratuitous.
- Color is restrained — usually one accent, lots of neutrals, real darks and real lights.
- Density is calibrated per surface — marketing pages breathe, data tables are dense.

### Design pass after every screen

After implementing a new screen or significant UI component, run a **design pass** step before moving on:

1. Re-engage the frontend-design skill.
2. Look at the current implementation honestly. Screenshot it mentally.
3. Ask: "Would this screen be at home inside Linear's product?"
4. If not, what's the gap? Is it worth 30 minutes of revision now?

Most of the time the answer is yes. The second-pass polish is the difference between competent and considered. Don't skip this step — it's where the project moves from "shipped" to "good."

### Libraries — what's worth reaching for and what isn't

**Reach for when relevant:**
- **Motion** (formerly Framer Motion) — tasteful page transitions, smooth list mutations, the agent-trace streaming UX in particular. One or two thoughtful moments per page; don't overuse.
- **Recharts** — for health-over-time chart in Phase 4. Minimal, good defaults.
- **Lucide icons** — already in the shadcn ecosystem; consistent and clean.
- **React Email** — for the digest in Phase 5.

**Don't reach for** unless I specifically ask:
- Three.js / WebGL — bundle size, complexity, almost always gratuitous on a productivity app.
- GSAP — Motion covers the same use cases at a fraction of the size.
- Lottie animations — read as "designer who learned about Lottie."
- Animated gradient meshes / shader backgrounds — every AI startup has these in 2026; it's already cliché.

### The highest-leverage screen in this app

The **agent run trace view** is the wow moment of the entire app. It's where a recruiter will linger longest and where the differentiation is most visible. Spend extra time there — streaming text as the agent iterates, smooth transitions between iterations, evidence cards that animate in as they're persisted. Most other screens can be cleanly competent; this one needs to feel alive.

### Documenting design decisions

When you make a meaningful design choice during implementation (e.g. "evidence cards are flat, not bordered, because density matters more than separation on this surface"), write it to `docs/DESIGN.md`. The next session won't remember the decision otherwise, and inconsistency creeps in screen by screen. Treat `DESIGN.md` like an extension of `CLAUDE.md` — read it before any UI work, update it after.



- **Don't reach for `useEffect`** to fetch data. Server Components or Server Actions.
- **Don't merge the researcher and evaluator roles** into a single agent. They have different prompts, different access patterns, different costs.
- **Don't add a vector DB** other than pgvector. We have Postgres; we're using its extension.
- **Don't add an agent framework** (LangChain, Mastra, Vercel AI SDK's agent helpers, etc.). The hand-written loop is the point.
- **Don't run agent calls during development without fixtures**. Real API calls cost real money. Use fixtures by default; opt in to real calls explicitly.
- **Don't store dates as strings.** `timestamptz` + IANA timezone column where the timezone matters (less common here than in Wayfare, but still — UTC always).
- **Don't suppress TypeScript errors silently.** Comment if you must `@ts-expect-error`.
- **Don't add dependencies without asking.** Especially anything that overlaps with what we use.
- **Don't write tests retroactively for coverage.** Tests come from the TDD skill during implementation. Tests for prompt outputs, evaluator decisions, and tool schemas are especially valuable; UI tests can wait.
- **Don't generate placeholder data and ship it.** If a feature needs real data flow, build the flow. Fixtures during dev are okay but flagged.

### UI anti-patterns (how Next.js apps end up looking generic)

- **Default shadcn Card wrapping everything.** Cards are a tool, not a default; many surfaces should be flat. Reach for borderless layouts and use whitespace for grouping where possible.
- **Centered narrow columns everywhere.** Vary the layout per surface — sidebars, two-column splits, asymmetric grids. The thesis dashboard especially should not look like a centered blog post.
- **Single font weight across the entire app.** Use weight contrast deliberately (typically 400 for body, 500 for emphasis, 600 for headings — but make the choice consciously).
- **Gray borders everywhere.** Either go light (no borders, just spacing) or dark (real contrast). Hairline grays read as "no decision was made."
- **Headers that are just bigger text.** Real hierarchy uses size, weight, color, and tracking together. A `<h1>` and a `<p>` should not feel like the same element at different scales.
- **Spinners as the default loading state.** Skeletons that match the layout that's coming are almost always better. Spinners convey "something is happening"; skeletons convey "I know what's coming."
- **`"use client"` at the top of files that don't need it.** Server Components are also a visual-density discipline — they render faster and feel snappier. The perceived performance of the app is part of its visual quality.


## When you're unsure

Ask one focused question rather than guessing. I'd rather answer a clarifying question now than untangle a wrong direction later. If you're stuck between two reasonable options, present them as A/B with trade-offs and let me pick.

## Free tier awareness

Same as Wayfare — every external service is on a free tier. Be mindful:
- Neon: 0.5 GB storage per project. Evidence content can be long; consider truncating raw content fields beyond a reasonable size (say, first 8KB).
- Vercel Hobby: 1M function invocations/month, 4 hours Active CPU.
- Inngest: 50k runs/month — generous, but each agent run can be many steps; monitor.
- Anthropic API: pay-as-you-go. Agent runs can be expensive ($0.10-1.00 each depending on iterations). Fixtures during dev are mandatory, not optional.
- Resend: 3,000 emails/month free, plenty.

If a decision could push us off a free tier, flag it.

## What "done" looks like for any task

1. `npm run typecheck` passes.
2. `npm run lint` clean.
3. Happy path works end-to-end manually (or via test).
4. At least one failure case handled (empty state, bad input, AI error, network error).
5. New env vars added to `.env.example` and `lib/env.*.ts`.
6. If schema changed: migration generated and applied.
7. A clear commit message explaining *why*, not just *what*.
8. **I've approved the change before you committed it.**
