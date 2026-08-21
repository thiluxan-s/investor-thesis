# Data Model

## Entity relationship

```
User (1) ──< (N) Thesis (1) ──< (N) Claim
                  │                   │
                  │                   └──< (N) ClaimEvidenceLink >── (N) Evidence
                  │                                                      ▲
                  │                                                      │
                  └──< (N) AgentRun ──< (N) AgentRunIteration            │
                                                │                        │
                                                └─ produces ─────────────┘
                                                
Source (1) ──< (N) Evidence
```

- A **User** has many **Theses**.
- A **Thesis** has many **Claims** (the structured falsifiable statements that make up the thesis).
- A **Thesis** has many **AgentRuns** (each is one execution of the researcher loop).
- An **AgentRun** has many **AgentRunIterations** (the full trace for inspection).
- An **AgentRun** produces many **Evidence** rows.
- An **Evidence** belongs to a **Source** (deduped by URL hash).
- A **Claim** and an **Evidence** are linked via **ClaimEvidenceLink** (with the evaluator's verdict).

All deletions cascade downward. Deleting a thesis removes claims, agent runs, evidence (if not referenced by another thesis — see Evidence section).

## Table-by-table

### `users`

Identical to Wayfare's pattern. Thin row keyed to Clerk.

```ts
{
  id: uuid (pk)
  clerk_user_id: text (unique, indexed)
  email: text
  created_at: timestamptz
  updated_at: timestamptz
}
```

### `theses`

```ts
{
  id: uuid (pk)
  user_id: uuid (fk → users.id, on delete cascade, indexed)
  title: text                                  // "Long NVDA — data center thesis"
  ticker: text                                 // "NVDA" — canonicalized uppercase
  position_direction: enum('long', 'short')
  time_horizon: enum('weeks', 'months', '6_to_12_months', 'years')
  status: enum('active', 'paused', 'closed')   // 'closed' = position exited; we keep history
  notes: text                                  // free-text personal notes
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Indexes:** `user_id` for the list view; `(user_id, status)` for the active-thesis filter.

**Why an enum for time_horizon instead of dates?** Investors think in horizons, not dates ("I expect this to play out over a year"). Enum is cleaner and gives us four buckets for evidence-decay weighting.

### `claims`

The structured falsifiable statements that make up a thesis.

```ts
{
  id: uuid (pk)
  thesis_id: uuid (fk → theses.id, on delete cascade, indexed)
  ordinal: integer                              // for stable ordering
  statement: text                               // "Data center revenue grows >40% YoY for the next 4 quarters"
  category: enum(
    'financial_performance',      // earnings, revenue, margins
    'product_traction',           // adoption, design wins, customer counts
    'competitive_position',       // moat, market share, competitor moves
    'macro_environment',          // industry trends, regulation
    'execution',                  // management, strategy, capital allocation
    'valuation',                  // multiples, comps
    'other'
  )
  current_health_score: numeric(3,2) (default 0)  // -1.00 to +1.00, computed
  current_health_updated_at: timestamptz
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Why categories?** Two reasons. First, they're prompt-engineering hints — telling the researcher "this is a financial-performance claim" focuses its search. Second, they make the UI scannable ("3 of your 5 financial claims are weakening").

**Why store `current_health_score` denormalized?** The thesis list view shows health at a glance for every thesis. Computing it on every page load would mean joining/aggregating evidence across all theses. The link table writes update this row in the same transaction.

### `agent_runs`

One row per execution of the researcher loop.

```ts
{
  id: uuid (pk)
  thesis_id: uuid (fk → theses.id, on delete cascade, indexed)
  status: enum('queued', 'running', 'complete', 'partial', 'failed')
  trigger: enum('manual', 'scheduled')
  mode: enum('research', 'challenge') (default 'research')  // orthogonal to trigger: trigger is
                                                              // WHO started the run, mode is WHAT
                                                              // it was looking for. Defaults to
                                                              // 'research' so every pre-Phase-7 row
                                                              // backfills correctly.
  started_at: timestamptz (nullable)            // null while 'queued'
  completed_at: timestamptz (nullable)
  iterations_used: integer (default 0)
  input_tokens: integer (default 0)
  output_tokens: integer (default 0)
  evidence_collected: integer (default 0)
  error: text (nullable)                         // human-readable failure summary
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Why track tokens explicitly?** Cost transparency. The UI can show "this run cost ~$0.12" which is genuinely useful and a great interview detail.

### `agent_run_iterations`

Every iteration of the loop. Source of truth for the trace view.

```ts
{
  id: uuid (pk)
  agent_run_id: uuid (fk → agent_runs.id, on delete cascade, indexed)
  iteration_number: integer
  request_messages: jsonb                       // exact messages sent to Anthropic
  response_content: jsonb                       // assistant content blocks (text + tool_use)
  tool_calls: jsonb                             // array of { tool_name, input, output, error }
  stop_reason: text                             // 'end_turn', 'tool_use', 'max_tokens', etc.
  input_tokens: integer
  output_tokens: integer
  duration_ms: integer
  created_at: timestamptz
}
```

**Why store everything as JSONB?** The shape of these blobs is Anthropic's choice, not ours. Storing them raw means we can render the trace exactly as it was, including blocks we don't fully understand at render-time. Cheap to store, expensive to lose.

**Indexes:** `(agent_run_id, iteration_number)` — every read is "show me this run's trace in order."

### `sources`

The websites/documents the agent has fetched. Deduped across all users and runs.

```ts
{
  id: uuid (pk)
  url: text (not null)
  url_hash: text (unique, indexed)              // sha256 of normalized URL
  domain: text (indexed)                        // extracted, for analytics/filtering
  title: text
  fetched_at: timestamptz
  raw_content_hash: text (indexed)              // for content-level dedup
  content_excerpt: text                         // first 8KB, for re-reading without re-fetching
  created_at: timestamptz
}
```

**Why dedup at the source level?** A single source (e.g. an NVDA earnings press release) can be relevant to multiple theses for the same user, or to theses across different users. Fetching once is right.

**Privacy note:** sources are *not* user-scoped. They're public web content. Evidence (which links a source to a specific thesis/claim) IS user-scoped via the thesis.

### `evidence`

A piece of evidence extracted from a source, relevant to one or more claims.

```ts
{
  id: uuid (pk)
  agent_run_id: uuid (fk → agent_runs.id, on delete cascade, indexed)
  source_id: uuid (fk → sources.id, indexed)
  extracted_text: text                           // the snippet that's the actual evidence
  extracted_text_embedding: vector(1536) (nullable) // pgvector, for similarity dedup
  agent_reasoning: text                          // why the researcher flagged this as relevant
  created_at: timestamptz
}
```

**Why is `extracted_text` separate from the source's `content_excerpt`?** The source might be a 5,000-word article. The evidence is the *specific paragraph* that matters. Cleaner display in the UI, cleaner input to the evaluator.

**Why embed the extracted text?** Future similar-evidence lookup: "have we seen evidence like this before?" Hedge against the agent reporting the same point worded slightly differently across runs.

### `claim_evidence_links`

The join table where the evaluator's verdict lives.

```ts
{
  id: uuid (pk)
  claim_id: uuid (fk → claims.id, on delete cascade, indexed)
  evidence_id: uuid (fk → evidence.id, on delete cascade, indexed)
  impact: enum('strengthens', 'neutral', 'weakens')
  confidence: numeric(3,2)                       // 0.00 to 1.00
  reasoning: text                                // evaluator's explanation
  evaluator_prompt_version: text                 // for cache invalidation when we change prompts
  created_at: timestamptz
  
  // Unique constraint on (claim_id, evidence_id) — one evaluation per pair
}
```

**Indexes:** unique `(claim_id, evidence_id)`. Also index on `claim_id` alone for the "show this claim's evidence" query.

**Why store `evaluator_prompt_version`?** If we change the evaluator prompt mid-project, old evaluations should be marked stale. Comparing version strings tells us what to re-evaluate.

### `challenge_briefs`

One row per completed challenge run — the stored "case against the thesis."

```ts
{
  id: uuid (pk)
  agent_run_id: uuid (fk → agent_runs.id, on delete cascade, unique)
  thesis_id: uuid (fk → theses.id, on delete cascade, indexed with created_at)
  headline: text                                 // one-line summary of the strongest counter-argument
  summary: text                                  // paragraph-length synthesis
  points: jsonb                                  // ChallengeBriefPoint[] — see lib/ai/schemas/challenge-brief.ts
  prompt_version: text                           // for cache invalidation when we change prompts
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Why unique on `agent_run_id`?** A challenge brief is the terminal output of exactly one challenge run — same relationship as `thesis_health_snapshots` to `agent_runs`.

**Why denormalise `thesis_id`?** `agent_run_id` already gets you to the thesis via `agent_runs.thesis_id`, but every read of this table is "show me this thesis's briefs over time," same access pattern as `thesis_health_snapshots`. Storing `thesis_id` directly avoids a join on the hot path and lets us index `(thesis_id, created_at)` for that query.

**Cascade behaviour:** deleting a thesis cascades to its agent runs, its challenge briefs, and everything else owned by it. Deleting an agent run cascades to its (at most one) challenge brief.

**Rendering `points[].claimOrdinal` — a trap avoided.** `claimOrdinal` is the claim's raw `claims.ordinal`, stored alongside `claimId` as a snapshot of what the brief argued against. It is **not** a display number. Every existing surface labels claims by array position + 1 (`lib/agent/evidence-verdicts.ts` emits `claimNumber: idx + 1`), and `deleteClaim` does not renumber survivors — so a thesis with ordinals `[0, 2, 3]` has a run trace calling the second claim "2" while a brief rendered as `claimOrdinal + 1` would call the same claim "3". The brief's rendering path avoids this: `resolveBriefCitations` (`lib/agent/brief-citations.ts`) resolves each point's label by looking up `claimId` in the thesis's ordinal-ordered claim list and using that position, producing a `claimNumber` field the UI renders instead of `claimOrdinal + 1` — `claimOrdinal` itself stays on `ResolvedPoint` only as the persisted snapshot, never as display data. (`buildChallengeBriefTask` does the analogous lookup when numbering claims for the prompt.)

## What we deliberately don't model

- **No separate `Ticker` or `Company` table.** Free text `ticker` column is enough. Normalizing would add UX friction (autocomplete? what if the user types `NVDA.US`?) for no real value in v1.
- **No `User.preferences` table.** No preferences in v1.
- **No `Watchlist`.** That's a separate product; this tool is for held positions.
- **No `Comment` or `Note` per evidence.** v2.
- **No soft deletes.** Cascade is enough; "undo" is a v2 concern.
- **No audit log.** This is a single-user app per Clerk account. The agent run history *is* the audit log for the only mutations that matter.

## Migrations

Same workflow as Wayfare. Drizzle generates into `drizzle/`. Always commit generated migrations. Never edit applied migrations.

```bash
npm run db:generate   # after editing schema
npm run db:migrate    # apply
npm run db:push       # local dev only — skip migration files
```

## pgvector setup

pgvector is a Postgres extension. To enable on Neon:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This goes in the first migration. Drizzle supports the `vector` type via `drizzle-orm/pg-core` (check Context7 for current syntax).

**Honesty note:** `evidence.extracted_text_embedding` is declared and indexed, but nothing in the codebase writes or reads it — the column is reserved for a possible similarity-dedup pass, not wired up. Turning it on would also mean adding an embedding provider: Anthropic exposes no embeddings endpoint, so the vectors would have to come from a third party (Voyage, OpenAI, or a local model). That dependency is the main reason this is still a reservation rather than a feature.

## Seeding

A `scripts/seed.ts` creates:
- One demo user (Clerk sandbox or a designated "demo" account)
- One demo thesis ("Long NVDA — data center thesis")
- 4 claims under it
- One completed agent run with realistic iterations
- 6-8 evidence rows linked to claims with varying impacts

This is the trip a recruiter sees if they click "Try the demo" without signing up. Pre-seeded; updated periodically; never destroyed by user activity (the demo account is read-only via app-level checks).
