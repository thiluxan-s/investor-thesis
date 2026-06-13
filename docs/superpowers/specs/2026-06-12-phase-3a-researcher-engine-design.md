# Phase 3a — Researcher Agent Engine — Design

**Date:** 2026-06-12
**Phase doc:** `docs/phases/phase-3-agent-loop.md` (Phase 3, backend half)
**Status:** design approved in brainstorming; ready for implementation plan.
**Companion spec (later):** Phase 3b — Agent run + trace UI (reads what this engine produces).

> Read `docs/ARCHITECTURE.md` → Agent Design and `docs/DATA_MODEL.md` before the plan. This is the most subtle phase of the project.

## Goal

A user (via a Server Action, no UI yet) can trigger an analysis run for a thesis. An Inngest function runs the **hand-written researcher loop**: it calls Claude (Opus 4.8) in a `while` loop with explicit stop conditions; Claude uses our four custom tools to search the web, fetch allow-listed pages, and look up SEC filings; the loop persists each iteration's full trace and each piece of evidence as it's found. No evaluation (Phase 4), no UI (Phase 3b). Success = a completed `agent_run` with ordered `agent_run_iterations` and linked `evidence`/`sources` rows you can inspect in the DB, runnable entirely offline from fixtures.

## Scope

**In:** `sources`, `evidence`, `agent_runs`, `agent_run_iterations` schema + pgvector extension + repos; the Anthropic client wrapper + fixture record/replay; the researcher loop; the four tools (`web_search`, `web_fetch`, `edgar`, `return_result`) with Zod schemas; prompts; the `run-agent` Inngest function + client + `/api/inngest` route; the `triggerAgentRun` Server Action; URL/content-hash dedup + seen-list.

**Out (deferred):** the run-card / polling / evidence-stream / trace UI (Phase 3b); the evaluator and `claim_evidence_links` (Phase 4); semantic/embedding dedup and the embeddings provider (later — see Dedup); the weekly cron + digest (Phase 5).

## Decisions locked during brainstorming

1. **Custom, client-side tools** — not Anthropic's hosted `web_search`/`web_fetch`. The hand-written loop, strict per-tool Zod validation, the domain allow-list, and a trace we own are the point of the phase (CLAUDE.md's "write the loop myself for transparency and interview narrative").
2. **Search provider: Brave Search API**, behind a swappable `SearchProvider` interface (`WEB_SEARCH_PROVIDER` seam). `web_search` returns `{title, url, snippet}` candidates; `web_fetch` does the reading — clean separation.
3. **Model: `claude-opus-4-8`** for the researcher (user chose max quality on the centerpiece), behind a single `CURRENT_MODEL` constant. Adaptive thinking, `effort` tunable (default `medium`).
4. **Reasoning shown in the trace** — request `thinking: { type: "adaptive", display: "summarized" }` so the (already-billed) reasoning is captured per iteration for Phase 3b to render. Display only controls visibility; no extra cost.
5. **One durable Inngest step per loop iteration** — resume-not-restart, memoized Claude calls (no double-billing on retry), evidence persisted as found. One analysis = one Inngest run (free-tier safe).
6. **Full-transcript fixtures** — record each scenario's ordered per-iteration `{Claude response, tool results}` under `__fixtures__/agent-runs/<scenario>/`; `USE_AI_FIXTURES=1` (default in dev) replays fully offline (no Anthropic, no Brave, no fetch); an explicit record command refreshes them. Seed two scenarios: `nvda-happy-path` (finds evidence) and `no-evidence` (finds none).
7. **Dedup: URL + content hash + seen-list now; semantic dedup deferred.** Enable pgvector and create the nullable `extracted_text_embedding` column (DATA_MODEL-compatible) but leave it unpopulated; the embeddings-provider choice (Anthropic has no first-party endpoint — Voyage et al.) is a later-phase decision.
8. **Phase split** — this spec is the backend engine only; the trace UI is Phase 3b with its own brainstorm + visual companion.

## Data model

New tables exactly per `docs/DATA_MODEL.md`. Drizzle, snake_case columns, every table has `id`/`created_at` (+ `updated_at` where DATA_MODEL specifies). Migration generated + committed. This phase's migration also runs `CREATE EXTENSION IF NOT EXISTS vector;` (DATA_MODEL "pgvector setup").

### Enums (pgEnum)
- `agent_run_status`: `queued` | `running` | `complete` | `partial` | `failed`
- `agent_run_trigger`: `manual` | `scheduled`

(Mirror enum value tuples in a client-safe schema module the way Phase 2 did, with the drift-guard test.)

### `sources` (deduped across all users/runs; not user-scoped — public web content)
`id`, `url` (not null), `url_hash` (unique, indexed — sha256 of normalized URL), `domain` (indexed), `title`, `fetched_at` (timestamptz), `raw_content_hash` (indexed — content-level dedup), `content_excerpt` (first 8KB), `created_at`.

### `agent_runs`
`id`, `thesis_id` (fk → theses.id, cascade, indexed), `status` (agent_run_status), `trigger` (agent_run_trigger), `started_at`/`completed_at` (nullable), `iterations_used` (default 0), `input_tokens`/`output_tokens` (default 0), `evidence_collected` (default 0), `error` (text, nullable), `created_at`, `updated_at`.

### `agent_run_iterations` (source of truth for the trace)
`id`, `agent_run_id` (fk → agent_runs.id, cascade, indexed), `iteration_number`, `request_messages` (jsonb), `response_content` (jsonb — assistant blocks incl. text + summarized thinking + tool_use), `tool_calls` (jsonb — `[{tool_name, input, output, error}]`), `stop_reason` (text), `input_tokens`/`output_tokens`, `duration_ms`, `created_at`. Index `(agent_run_id, iteration_number)`.

### `evidence`
`id`, `agent_run_id` (fk → agent_runs.id, cascade, indexed), `source_id` (fk → sources.id, indexed), `extracted_text` (text), `extracted_text_embedding` (`vector(1536)`, **nullable, unpopulated this phase**), `agent_reasoning` (text — why the researcher flagged it), `created_at`.

> No `claim_evidence_links` table yet — that's the evaluator's output (Phase 4). The researcher tags each evidence item with the claim indices it's relevant to (in `return_result`); we persist that association minimally now as an `integer[]` `claim_indices` column on `evidence` (avoids a throwaway join table), and the evaluator formalizes it via `claim_evidence_links` next phase.

## Repositories — `lib/db/repositories/`

`sources.ts`: `findOrCreateSource(input)` (dedup by `url_hash`; reuse existing), `listRecentSourceUrlsForThesis(thesisId, sinceDays)` (the seen-list).
`agent-runs.ts`: `createAgentRun(thesisId, trigger)` → row in `queued`; `markRunning`, `markComplete`, `markPartial`, `markFailed`; `incrementRunTotals(runId, {inputTokens, outputTokens, evidenceCollected})`; `getAgentRunForUser(userId, runId)` (ownership via thesis join, for later UI/action use).
`agent-run-iterations.ts`: `appendIteration(runId, iteration)`; `listIterations(runId)`.
`evidence.ts`: `createEvidence(input)`; `listEvidenceForRun(runId)`.

All `server-only`, `@/` imports, ownership-scoped where a user is involved. Multi-row inserts use `db.batch` (neon-http has no interactive transactions — Phase 2 lesson).

## Anthropic client + fixtures — `lib/ai/client.ts`

A thin wrapper over `@anthropic-ai/sdk` exposing one method the loop calls per iteration (`createMessage(params)`), plus token-usage extraction. Responsibilities:
- **Model/params defaults:** `CURRENT_MODEL = "claude-opus-4-8"`, `thinking: { type: "adaptive", display: "summarized" }`, `output_config: { effort: "medium" }` (tunable), `max_tokens: 8192` (non-streaming — background job, no client streaming in v1), prompt-cache breakpoints on the stable system prompt + tool list.
- **Fixtures:** when `USE_AI_FIXTURES=1`, do **not** hit the API — read the next recorded response for the active scenario from `__fixtures__/agent-runs/<scenario>/`. A `recordFixtures`/`AI_FIXTURE_MODE=record` path calls the real API and writes responses. The scenario name is passed into the run (a run option), so the loop and tools resolve the same scenario.
- **Tool-result fixtures:** the same scenario directory stores the tool results, so replay is fully offline (the tool layer also short-circuits under `USE_AI_FIXTURES`).
- **Errors:** surface typed SDK errors; map to `AgentRunError` for the loop's failure handling.

## The researcher loop — `lib/ai/agents/researcher.ts`

Hand-written `while` loop, per ARCHITECTURE pseudocode, adapted to current API + our `return_result` completion:

- **Inputs:** `thesis`, ordered `claims`, `seenSourceUrls`, a `persist` interface (so the loop is unit-testable with injected fakes), the Anthropic client, the tool registry, and the scenario name.
- **Messages:** seed with the task built from `buildResearchTask(thesis, claims, seenSourceUrls)`.
- **Stop conditions (explicit):** `iterations >= MAX_ITERATIONS (12)`; `tokensUsed >= MAX_TOKENS (100_000)`; the agent calls **`return_result`** (treated as completion — we capture its validated input as the final evidence set, persist, stop — we do *not* execute it as an ongoing tool); model `stop_reason: "end_turn"` with no `return_result` (finalize with any evidence gathered, status `complete`); unexpected `stop_reason` (e.g. `max_tokens`, `refusal`) → `failed`.
- **Per iteration:** call Claude → record token usage → **persist the iteration row** (request messages, response content incl. summarized thinking, stop_reason, usage, duration). If `tool_use` blocks present: validate each tool's input against its Zod schema (invalid → return a tool *error* result so the agent retries, never crash); execute valid ones via `executeToolCallSafely`; persist any evidence/sources produced immediately; append assistant + tool-result messages; continue.
- **Budget exceeded / cap hit:** mark run `partial` with a reason.
- **Trace fidelity:** every iteration is persisted as it happens (durability + the Phase-3b live effect). Final structured output is the validated `return_result` payload — no free-text JSON parsing.

Returns a structured summary the Inngest function uses to flip run status + totals.

## Tools — `lib/ai/tools/`

Toolkit is intentionally four tools (ARCHITECTURE: small focused sets beat sprawling ones). Each tool = `{ name, description, inputSchema (Zod), execute(input, ctx) }`; inputs validated before execution; execution errors become tool-error results, not crashes. Definitions in `lib/ai/tools/`, input/output Zod schemas in `lib/ai/schemas/`.

- **`web_search(query: string, limit?: number ≤ 10)`** → `{ results: {title, url, snippet}[] }`. Backed by the `SearchProvider` interface; Brave implementation in `lib/ai/tools/providers/brave.ts`. Under fixtures, returns recorded results.
- **`web_fetch(url: string)`** → `{ url, title, markdown }` (HTML→markdown via a lightweight converter; **hard-truncate to first ~8KB** to protect context + the Neon free tier). **Refuses any domain not on the allow-list** with a tool-error result the agent learns from. Persists/derefs the `sources` row (dedup by URL hash; store `content_excerpt`, `raw_content_hash`, `domain`, `title`).
- **`edgar(ticker: string, formType?: "10-K"|"10-Q"|"8-K")`** → recent filings `{form, filedAt, url}[]` via SEC EDGAR's free JSON API (`data.sec.gov`; requires a descriptive `User-Agent`). No key. EDGAR domains are implicitly allow-listed for `web_fetch`.
- **`return_result(evidence: EvidenceItem[])`** — the required final action; forces structured output. `EvidenceItem = { source_url, title, snippet, claim_indices: number[], extracted_text }`. Detected by the loop as completion.

**Domain allow-list** (starter set, editable — lives in one config module): `sec.gov`/`*.sec.gov`/`data.sec.gov`, `reuters.com`, `apnews.com`, `bloomberg.com`, `wsj.com`, `ft.com`, `cnbc.com`, `marketwatch.com`, `barrons.com`, `finance.yahoo.com`, `seekingalpha.com`, `fool.com`, `investor.*`/company IR subdomains, plus a few sector outlets (`theverge.com`, `arstechnica.com`, `semianalysis.com`). Non-listed → refused. (This list is a reviewable parameter.)

## Prompts — `lib/ai/prompts/researcher.ts`

Exports `{ systemPrompt, taskTemplate }` (content, not logic — kept out of the agent file). System prompt establishes the researcher role, the tool contract, the "gather, don't judge" boundary (no evaluation — that's the evaluator's job), the allow-list expectation, and the requirement to finish via `return_result`. `taskTemplate` renders the thesis, its claims (numbered, so `claim_indices` are meaningful), and the seen-source list. Written un-prescriptively (Opus 4.8 follows literally; avoid over-scaffolding).

## Inngest — `lib/inngest/`

- `client.ts` — Inngest client (app id, env keys). Dev uses the Inngest dev server; prod uses `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
- `app/api/inngest/route.ts` — the serve endpoint (App Router handler) exposing registered functions.
- `functions/run-agent.ts` — listens for `agent.run-requested { agentRunId, thesisId, userId, scenario? }`. Loads thesis + claims + seen-list (repos), flips run → `running`, drives the researcher loop with **one `step.run` per iteration** (memoized Claude call so retries don't re-bill), persists iterations/evidence as it goes, then flips run → `complete` / `partial` / `failed` with totals. Lets Inngest handle transient retries; no manual retry loops inside steps. (Note for the plan: confirm the serve function's max duration on Vercel Hobby accommodates a long Opus iteration; a single adaptive-thinking call can run minutes.)

## Server Action — `triggerAgentRun(thesisId)`

In `app/(app)/theses/actions.ts` (or a new `agent-actions.ts`): `requireUserId`, verify thesis ownership, `createAgentRun(thesisId, 'manual')` → `queued`, send the Inngest `agent.run-requested` event with `{ agentRunId, thesisId, userId }`, return `{ ok: true, data: { agentRunId } }`. Returns immediately (the loop runs in the background). Same `{ ok } | { error }` contract as Phase 2.

## Environment variables (additions, Zod-validated in `lib/env.server.ts`)

- `ANTHROPIC_API_KEY` — required unless `USE_AI_FIXTURES=1`.
- `BRAVE_API_KEY` — required unless `USE_AI_FIXTURES=1`.
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — prod; optional locally (dev server).
- `USE_AI_FIXTURES` — dev flag (default behavior: on in dev). When on, the Anthropic + Brave keys are not required and no network calls are made.
- `EDGAR_USER_AGENT` — descriptive UA string SEC requires (e.g. "ThesisTracker <email>").

All added to `.env.example`. Env validation must allow the fixtures path to run with no AI/Brave keys.

## Dedup

- **Source-level:** `findOrCreateSource` dedups by normalized-URL sha256 (`url_hash`); `raw_content_hash` catches the same content at different URLs.
- **Seen-list:** `listRecentSourceUrlsForThesis(thesisId, 90)` feeds the task prompt so the agent skips already-covered URLs.
- **Semantic (deferred):** pgvector enabled + `extracted_text_embedding vector(1536)` column created nullable; not populated. Provider choice (Voyage/etc.) is a later phase. (If the eventual provider's dimension differs from 1536, that's a small migration — flagged.)

## Testing (TDD targets — Vitest, no network, no DB)

Per CLAUDE.md, the logic-bearing, infra-free pieces are TDD'd; UI waits (3b). High-value targets:
- **Pure helpers:** URL normalization + sha256 hashing; domain allow-list matching (incl. subdomain + EDGAR cases); content-excerpt truncation.
- **Tool input schemas:** each tool's Zod schema (valid/invalid); `return_result`/`EvidenceItem` schema.
- **Tool execution with injected I/O:** `web_search` against a stub `SearchProvider`; `web_fetch` against a stub fetcher (allow-list refusal, 8KB truncation, HTML→markdown); `edgar` against a stub SEC client — all hermetic.
- **The loop with injected fakes** (mirrors Phase 1's `handleUserEvent` injection): a fake Anthropic client returning fixture responses + fake tools + a fake `persist`, asserting each stop condition (return_result completion, end_turn, iteration cap, token budget, unexpected stop_reason → failed), per-iteration persistence, tool-error-on-invalid-input (no crash), and token accounting.
- **Fixture round-trip:** record format loads and replays deterministically; the two seeded scenarios drive a full offline loop.

(Repository ownership/dedup SQL isn't unit-tested without a test DB — same constraint as Phase 2; verified manually + via the pure pieces it composes.)

## Free-tier / cost notes

- Dev + tests run on fixtures → ≈ $0. Real runs are explicit (record mode, manual demo triggers).
- Opus 4.8 with prompt caching on the stable system+tools prefix; `agent_runs` tracks token totals for cost transparency (a Phase-3b/interview detail).
- `content_excerpt`/`web_fetch` hard-truncated to ~8KB to protect Neon's 0.5GB.
- One Inngest run per analysis (well within 50k/mo).

## Definition of done

`npm run typecheck` + `npm run lint` clean; `npm test` green (the TDD suites above, on Node 22); a fixtured run via `triggerAgentRun` (or a dev harness) produces a complete `agent_run` with ordered iterations + linked evidence/sources, fully offline; the `no-evidence` scenario yields a clean `complete`-with-no-evidence run; migration generated/applied/committed (incl. pgvector extension); new env vars in `.env.example` + `lib/env.server.ts` with the fixtures-path allowance; each change approved before commit (CLAUDE.md). No UI in this phase.
