# Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 16 App (Vercel)                      │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │   Server     │    │   Server     │    │  API Route   │      │
│   │  Components  │    │   Actions    │    │   Handlers   │      │
│   │  (read DB)   │    │  (mutations) │    │  (webhooks)  │      │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│          │                   │                   │              │
│          └───────────────────┴───────────────────┘              │
│                              │                                  │
│                  ┌───────────┴────────────┐                     │
│                  │   Clerk middleware     │                     │
│                  └────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌──────────┐  ┌──────────┐  ┌────────────────┐
  │  Neon   │   │ Inngest  │  │ Resend   │  │  Anthropic API │
  │Postgres │   │ (agent   │  │ (weekly  │  │  - Researcher  │
  │+pgvector│   │  runs +  │  │  digest) │  │  - Evaluator   │
  │+Drizzle │   │  cron)   │  │          │  │  - Embeddings  │
  └─────────┘   └────┬─────┘  └──────────┘  └────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │   Agent's    │
              │    tools:    │
              │  web_search  │
              │  web_fetch   │
              │  edgar       │
              └──────────────┘
```

## The two critical flows

### Flow 1: User triggers an analysis run

```
1. USER clicks "Analyze now" on the thesis dashboard.
                │
                ▼
2. SERVER ACTION
   - Verifies user owns the thesis
   - Creates an AgentRun row: status='queued', thesis_id, trigger='manual'
   - Sends Inngest event: agent.run-requested { agentRunId }
   - Returns immediately. UI shows "agent running..." card.
                │
                ▼
3. INNGEST FUNCTION picks up the event
   - Loads thesis + claims from DB
   - Loads list of recently-seen source URLs (last 90 days) — for dedup
   - Initializes researcher agent loop (see Agent Design below)
   - Each loop iteration is one Inngest step: durable, retryable
   - Each new piece of evidence is persisted as it's found, not batched
   - When loop completes (or hits stop condition): flips AgentRun to 'complete' or 'failed'
                │
                ▼
4. EVALUATOR runs as a separate Inngest function, triggered by 'evidence.collected'
   - For each new evidence row, evaluates against each thesis claim
   - Writes claim_evidence_links with impact (strengthens/neutral/weakens) + reasoning
                │
                ▼
5. UI polls AgentRun status every 3s while 'running'; updates when 'complete'
```

### Flow 2: Weekly scheduled run + digest

```
1. INNGEST CRON fires every Sunday at 09:00 UTC
                │
                ▼
2. SCHEDULER FUNCTION
   - Lists all active theses across all users
   - For each, sends agent.run-requested { trigger: 'scheduled' }
                │
                ▼
3. AGENT RUNS execute as in Flow 1 (same code path)
                │
                ▼
4. DIGEST GENERATOR runs after all agent runs for a user complete
   - Aggregates the week's evidence by thesis
   - Calls Anthropic once to write a short digest per thesis
   - Sends a single email per user via Resend
```

## Agent Design — the heart of the project

This section is the most important in the document. Read it carefully.

### Three agents, separate concerns

**Researcher** (`lib/ai/agents/researcher.ts`) is a loop. Its job is to find new evidence relevant to a thesis. It has tools to search the web, fetch pages, and look up SEC filings. It does *not* evaluate whether evidence strengthens or weakens a claim — that's not its job. Its output is a list of structured evidence objects, each tagged with which claim(s) it's relevant to.

**Evaluator** (`lib/ai/agents/evaluator.ts`) is a one-shot call. Its job is to take a single evidence object and a single claim, and decide: does this evidence strengthen, weaken, or not affect this claim? With what confidence? Why? It does *not* search for anything; it operates only on what the researcher gathered.

**Drafter** (`lib/ai/agents/drafter.ts`) is a one-shot call (no loop). Its job is to take a user's free-text paragraph describing their reasoning, plus the ticker and position direction, and extract 2-7 structured claims with category labels. It does *not* search for anything; it doesn't decide what's right or wrong; it just structures the user's own words. The user reviews and edits the output before saving.

**Why separate them?**

1. **Different prompts, different optimal models.** Each agent has a focused job. We can tune each independently. The researcher needs broad context, tool use, and patience. The evaluator needs precise judgment on a focused question. The drafter needs structured-output discipline against the user's own wording.
2. **A model evaluating its own work is biased.** Well-documented; Anthropic explicitly recommends separation for agent verification. If one model both gathers and judges, it tends to inflate the importance of evidence it found.
3. **Cleaner failure modes.** Each agent can be re-run independently. If the evaluator's judgment seems off for a specific (claim, evidence) pair, we re-run *just that pair* without re-gathering. If the drafter produces wonky claims, the user edits them in place — no other state is affected.
4. **Architectural seams for the future.** Adding a fourth agent role (e.g. "summarizer" for the weekly digest, "devil's advocate" that explicitly looks for counter-evidence) becomes "drop a file in `lib/ai/agents/`." See the Extension Seams section.
5. **Better story in interviews.** "Three agents with distinct roles" is concrete and explainable.

### The researcher's loop

```ts
// Pseudocode — full implementation in lib/ai/agents/researcher.ts
async function runResearcher(thesis, claims, seenSources, persist) {
  const messages: Message[] = [
    { role: 'user', content: buildResearchTask(thesis, claims, seenSources) }
  ];
  let iterations = 0;
  let tokensUsed = 0;
  const MAX_ITERATIONS = 12;
  const MAX_TOKENS = 100_000; // hard budget per run

  while (iterations < MAX_ITERATIONS && tokensUsed < MAX_TOKENS) {
    const response = await anthropic.messages.create({
      model: CURRENT_MODEL,
      system: RESEARCHER_SYSTEM_PROMPT,
      tools: RESEARCHER_TOOLS,
      messages,
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    await persist.traceIteration(iterations, response);

    if (response.stop_reason === 'end_turn') {
      // Agent decided it's done. Extract structured final output from its last message.
      return extractFinalResult(response);
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = await Promise.all(
        toolUseBlocks.map(executeToolCallSafely) // validates input via Zod, catches errors
      );
      // If a new piece of evidence came out of the tool calls, persist it immediately
      // so partial work isn't lost on a crash.
      await persistAnyEvidence(toolResults);
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      iterations++;
      continue;
    }

    // Unexpected stop_reason (e.g. 'max_tokens') — treat as failure
    throw new AgentRunError(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  // Stop condition hit (iterations or tokens). Mark run as partial-complete.
  return { partial: true, reason: 'budget_exceeded' };
}
```

The key design properties:

- **Explicit stop conditions.** Iterations cap, token budget, model's own decision to stop, or unexpected error. No infinite loops.
- **Every iteration is persisted.** Crashes don't lose work. The agent trace shown to the user is *real*, not summarized.
- **Tool calls are validated.** Each tool's input goes through Zod before execution. Invalid args become tool error responses (the agent learns and tries again) rather than crashes.
- **Final result is structured.** The researcher's last message must use a `return_result` tool with a Zod-validated schema. No parsing free-form text.

### Tools the researcher uses

The toolkit is intentionally small (Anthropic's writing-tools-for-agents guidance: small focused tool sets beat sprawling ones).

1. **`web_search(query: string, limit?: number)`** — searches the web, returns title/URL/snippet for each result. Powered by Anthropic's hosted web search tool if usable in our context, otherwise a wrapper around a search provider.
2. **`web_fetch(url: string)`** — fetches a URL, converts HTML to clean markdown (`turndown` or similar), returns first ~8KB of content. Hard-truncates to protect context budget. Refuses domains that aren't allow-listed news/IR/research sites.
3. **`edgar_lookup(ticker: string, formType?: '10-K'|'10-Q'|'8-K')`** — queries SEC EDGAR's free JSON API, returns recent filings with their direct URLs.
4. **`return_result(evidence: EvidenceItem[])`** — the agent's required final action. Forces structured output. Each `EvidenceItem` has `{ source_url, title, snippet, claim_indices: number[], extracted_text }`.

That's four tools. Anything more is feature creep.

### The evaluator

```ts
// Pseudocode — full implementation in lib/ai/agents/evaluator.ts
async function evaluate(claim: Claim, evidence: Evidence): Promise<EvaluationResult> {
  const response = await anthropic.messages.create({
    model: CURRENT_MODEL,
    system: EVALUATOR_SYSTEM_PROMPT,
    tools: [RETURN_EVALUATION_TOOL],
    tool_choice: { type: 'tool', name: 'return_evaluation' },
    messages: [{
      role: 'user',
      content: buildEvaluationTask(claim, evidence),
    }],
  });
  return parseAndValidateToolResponse(response);
}
```

Properties:
- **Single API call.** No loop.
- **Forced tool use.** `tool_choice` set to a specific tool means the model *must* return structured output via that tool.
- **Zod validation on the way out.** The evaluation is `{ impact: 'strengthens'|'neutral'|'weakens', confidence: number_0_to_1, reasoning: string }`.
- **Run for every (claim, evidence) pair.** O(claims × evidence). At 5 claims and 20 evidence items per run, that's 100 calls. Each is cheap (small input, small output), but worth caching by content hash if the same evidence applies to multiple theses.

### The drafter

```ts
// Pseudocode — full implementation in lib/ai/agents/drafter.ts
async function draftClaims(
  ticker: string,
  positionDirection: 'long' | 'short',
  reasoningParagraph: string,
): Promise<DraftedClaims> {
  const response = await anthropic.messages.create({
    model: CURRENT_MODEL,
    system: DRAFTER_SYSTEM_PROMPT,
    tools: [RETURN_DRAFTED_CLAIMS_TOOL],
    tool_choice: { type: 'tool', name: 'return_drafted_claims' },
    messages: [{
      role: 'user',
      content: buildDraftingTask(ticker, positionDirection, reasoningParagraph),
    }],
  });
  return parseAndValidateToolResponse(response);
}
```

Properties:
- **Single API call, no loop.** Identical mechanical shape to the evaluator. Cheap, fast, predictable.
- **Forced tool use.** Output is `{ claims: Array<{ statement: string, category: ClaimCategory, source_excerpt: string }> }`. The `source_excerpt` is the substring of the user's input that the claim is derived from — useful for the review UI to highlight which words map to which claim.
- **2-7 claims, not 2-5.** A bit wider than the manual flow so the user has options to discard from. The UI gates the final saved count to ≤5.
- **The user's input is the source of truth.** Prompt explicitly instructs: "Do not introduce reasoning the user didn't provide. Do not assess validity. Extract what is there, in their voice." Drafting is *not* opinion generation.

UX flow on the new-thesis page:
1. User picks ticker + position direction.
2. Two-tab interface: "Write claims manually" / "Start from a paragraph."
3. In paragraph mode: user types/pastes their reasoning, clicks "Draft claims."
4. Drafter runs, claims appear as editable cards. User can delete, edit, reorder.
5. User saves the thesis with the final 2-5 claims.

### Thesis health calculation

This is deterministic code, not AI. Given all the `claim_evidence_links` for a claim, compute:
- A weighted sum of impacts (strengthens=+1, neutral=0, weakens=-1), weighted by confidence.
- Decay over time (evidence from 6 months ago counts less than evidence from last week).
- Output a single score from -1 to +1 per claim, plus an overall thesis health from the average.

Code, not AI, because: deterministic, debuggable, fast, free. We use the AI for things that need judgment; we use code for things that need consistency.

## Layers

### Presentation
- Server Components for everything read-related.
- Server Actions for mutations and triggering agent runs.
- Mapbox-equivalent of this project: none. Dashboards are HTML + Tailwind + a charting library only if needed (probably Recharts for the health-over-time chart in Phase 4).

### Application
- Server Actions colocated with routes.
- Business logic in `lib/`.
- Inngest functions in `lib/inngest/functions/`.

### Data
- Drizzle is the only thing that talks to Postgres.
- All queries through `lib/db/repositories/`.

### AI
- One Anthropic client wrapper in `lib/ai/client.ts`.
- Each agent in its own file under `lib/ai/agents/`.
- Tools in `lib/ai/tools/` with strict Zod schemas.
- Prompts in `lib/ai/prompts/`, separate from agent code.

## Authentication and authorization

Same pattern as Wayfare: Clerk handles auth, we store `clerk_user_id` on a thin `users` row. Every Server Action and Inngest function checks ownership before doing anything. Inngest functions receive `userId` as part of their event payload and verify access.

## Environment configuration

`lib/env.server.ts` and `lib/env.client.ts` — split from the start (Wayfare's Phase 2 follow-up). Zod-validated at module load.

Required env vars:
- `DATABASE_URL`
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `WEB_SEARCH_PROVIDER` and its associated key (TBD in Phase 3)
- `USE_AI_FIXTURES` (dev-only flag)

## Extension seams — where future features plug in

This architecture is designed to be *extended*, not rewritten, as the product evolves. Every item in the PRD's v2 list has a clear plug-in point. If a future feature requires reshaping the core architecture, that's a signal that something is wrong with the design.

| Future feature | Where it plugs in |
|----------------|-------------------|
| New evidence sources (Reddit, Twitter, podcasts, paid data APIs) | A new tool in `lib/ai/tools/`. Researcher's tool list grows by one entry. No other code changes. |
| New agent roles (summarizer, devil's advocate, fact-checker) | A new file in `lib/ai/agents/`. Wire into Inngest if it runs async. |
| New notification channels (Slack, SMS, in-app push) | A new wrapper in `lib/notifications/` parallel to `lib/resend/`. Digest function takes a notification adapter. |
| Public thesis sharing (read-only links) | New `thesis_shares` table; new public route `app/share/[shareId]/page.tsx`; reuses existing thesis-rendering components. |
| Real-time updates (replace polling) | Swap the polling hook on agent-run cards for a Server-Sent Events or Inngest realtime subscription. Data model unchanged. |
| Conversational Q&A about a thesis | New agent + tool surface scoped to "read this user's data." Likely lives in `lib/ai/agents/qa.ts` with retrieval tools over the user's evidence. |
| Backtesting (rerun analysis against historical windows) | The `AgentRun` model already captures runs at specific moments. Need a backfill harness that simulates "today is 2024-06-01" — the agent's web tools already let it look at sources from any date. |
| Multi-tenancy / team mode (shared theses) | The schema already has `user_id` on theses. Adding a `thesis_collaborators` table extends the access model. Ownership checks centralize in a single `canAccessThesis(userId, thesisId)` helper. |
| Tagging and thesis comparison | Add a `thesis_tags` join table; comparison is a Server Component that pulls two theses and renders side-by-side. |
| AI-generated full theses from just a ticker (a v2 drafting mode) | New variant of the drafter, lives alongside the current paragraph-based one. UI adds a third tab to the new-thesis flow. |

The pattern: **add files, not refactors.** When designing new features, ask "what new files would this require?" If the answer involves changing the shape of existing tables, modifying core agent contracts, or rewriting cross-cutting code, pause and reconsider — there might be a better seam.

## What we are *not* building

- No vector DB other than pgvector.
- No caching layer (no Redis). Server Component caching is enough.
- No agent framework.
- No GraphQL/tRPC.
- No state management library.
- No real-time updates (WebSockets/SSE). Polling every 3s while a run is in progress is fine for v1.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Agent runs cost too much during development | Mandatory fixtures (`USE_AI_FIXTURES=1` by default in dev). Real calls explicit. |
| Agent runs infinitely | Hard iteration cap (12) and token budget per run. Stop conditions documented. |
| Tool calls fail (network, bad input, source blocks us) | Tool errors returned as tool results, agent continues. Never crashes the run on a single tool failure. |
| User uploads bogus thesis ("AAPL will go up forever") | We track whatever they give us. Evaluator naturally returns low-confidence neutral for unfalsifiable claims. Don't try to police thesis quality in v1. |
| Evidence dedup fails and we reprocess same news | URL hash + content hash on `sources` table; agent gets seen list as input. |
| User base grows (lol) and we blow free tier | Free tier limits are well above what one demo + me + a few recruiters will hit. Worry later. |
| Evaluator disagrees with itself across runs (non-determinism) | Cache evaluator results by (claim_id, evidence_id, prompt_version). Don't re-evaluate same pair. |
| Anthropic API outage during demo | Pre-seeded demo thesis with cached agent run trace works even if API is down. |
