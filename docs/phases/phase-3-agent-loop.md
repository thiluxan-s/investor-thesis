# Phase 3 — The Researcher Agent Loop

**Goal:** A user clicks "Analyze now" on their thesis. An Inngest function runs the researcher agent loop. The loop calls tools (web search, fetch, EDGAR), collects evidence, persists it. The agent run trace is visible to the user. No evaluation yet — that's Phase 4.

**Prerequisite:** Phase 2 complete.

> **Read `docs/ARCHITECTURE.md` Agent Design section carefully before planning this phase.** This is the most subtle phase of the project.

## Deliverables (high level)

1. Schema additions: `sources`, `evidence`, `agent_runs`, `agent_run_iterations`.
2. Repositories for each.
3. Inngest configured: client, signing key, webhook route at `/api/inngest`, dev server.
4. `lib/ai/client.ts` — Anthropic client wrapper.
5. `lib/ai/agents/researcher.ts` — the loop. Hand-written. Explicit stop conditions.
6. `lib/ai/tools/` — `web_search.ts`, `web_fetch.ts`, `edgar.ts`, `return_result.ts`. Each with a Zod schema and execution function.
7. `lib/ai/prompts/researcher.ts` — the system prompt and the per-thesis task template.
8. `lib/ai/schemas/` — Zod schemas for evidence items and the return_result tool.
9. Fixture infrastructure: `__fixtures__/agent-runs/` with cached responses, `USE_AI_FIXTURES=1` env var.
10. Inngest function `run-agent.ts` that wraps the loop.
11. Server Action: `triggerAgentRun(thesisId)` — sends Inngest event, creates AgentRun row.
12. UI:
    - Agent run card on the thesis detail page: "running" / "complete" / "failed" states.
    - Polling every 3s while running.
    - Evidence list grows as the agent finds things (persisted during the loop, not at the end).
    - Click into an agent run → trace view showing iterations.

## Notes for when we get here

- The trace view is the wow feature of Phase 3. Make it look good — every iteration as a card, tool calls expandable, costs shown.
- The web_fetch tool should refuse domains not on an allow-list (news sites, IR pages, EDGAR, well-known financial sources). This is both safety and a portfolio-quality decision worth showing.
- Tests for tool schemas: TDD-friendly. Each tool is a function with strict input/output — perfect for Vitest.
- The fixtures must include at least one "happy path" run and one "agent fails to find evidence" run so the UI handles both.

---

(More detail to be added before starting this phase.)
