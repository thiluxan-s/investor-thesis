# Phase 3b — Agent Run UI & Trace View — Design

**Date:** 2026-06-13
**Phase doc:** `docs/phases/phase-3-agent-loop.md` (Phase 3, UI half)
**Status:** design approved in brainstorming; ready for implementation plan.
**Builds on:** Phase 3a engine (`agent_runs` / `agent_run_iterations` / `evidence` rows; `triggerAgentRun` action; repos `getAgentRunForUser`, `listIterations`, `listEvidenceForRun`).

## Goal

A user clicks **"Analyze now"** on a thesis, sees the run progress live (status, growing evidence, cost), and can open a full **trace view** — the wow screen — that shows the agent's reasoning, tool calls, results, and evidence as an immersive timeline. No evaluation/health yet (Phase 4). Reads what the 3a engine produced; adds no new agent logic.

## Scope

**In:** enable + wire the "Analyze now" button to `triggerAgentRun`; an agent-run panel in the detail-page rail (idle/queued/running/complete/partial/failed states, live counts + cost, "View trace" link, recent-runs list); ~3s polling while a run is in progress; the trace-view sub-route `/theses/[thesisId]/runs/[runId]`; a token→cost utility; the frontend-design pass on the trace view; DESIGN.md updates.

**Out (deferred):** evaluation, `claim_evidence_links`, and health bars (Phase 4); the weekly cron + digest (Phase 5); the pre-seeded demo thesis (its own phase); real-time SSE (ARCHITECTURE keeps polling for v1).

## Decisions locked during brainstorming

1. **Trace view = sub-route** `/theses/[thesisId]/runs/[runId]` (full-width, linkable, Server-Component read) — not a slide-over.
2. **Live updates = polled incremental reveal, not token-streaming.** The run executes in the background (Inngest); the UI polls and new iterations/evidence animate in, then settle into a static trace on completion.
3. **Poll mechanism = `router.refresh()` on a ~3s interval** while status is `queued`/`running`; stops on a terminal status. Re-runs the Server Component (re-reads repos) — no new JSON endpoint.
4. **Trace content = full:** per iteration — summarized thinking, tool calls (collapsible), tool results (errors marked calmly), tokens + duration; run-level **cost estimate** ("~$0.12" from Opus 4.8 pricing) + status + duration.
5. **Trace layout = immersive single-column timeline** (vertical spine, numbered iteration nodes, reasoning → tool calls → evidence inline at the iteration that found it), with a **running-pulse** node on the active iteration, a **brick "refused" chip** for allow-list-blocked fetches, and a **slim sticky status header** (live status + cost while running).
6. **Dev loop = `npm run dev` + `npx inngest-cli dev` with `USE_AI_FIXTURES=1`** → a triggered run completes offline/instantly via the seeded scenario.
7. **Design quality:** the **frontend-design skill** is invoked when building the run card, evidence cards, and trace view; a dedicated **design pass on the trace view** follows (DESIGN.md "design pass after every screen"), benchmarked against Linear/Vercel/Granola; decisions recorded back into DESIGN.md. All surfaces use the locked tokens (Direction A deep-blue `#1E3A5F`, Geist Sans/Mono, zinc neutrals, flat-over-carded, restrained motion).

## Data flow

- **Detail page** (`/theses/[thesisId]`, Server Component) additionally reads the thesis's runs via a new repo fn and renders the **AgentRunPanel** in the rail's "Analysis" slot.
- **AgentRunPanel** is a client component: shows the latest run's state + a short recent-runs list; if the latest run is `queued`/`running`, a small polling wrapper calls `router.refresh()` every 3s (cleared on terminal status). "Analyze now" calls `triggerAgentRun` (then `router.refresh()` to show the new `queued` run).
- **Trace sub-route** (`/theses/[thesisId]/runs/[runId]`, Server Component) reads `getAgentRunForUser` (ownership; `notFound()` otherwise) + `listIterations` + `listEvidenceForRun`, and renders the immersive timeline. While the run is non-terminal, the same `router.refresh()` polling reveals new iterations/evidence.

## New repository read

`lib/db/repositories/agent-runs.ts`: add `listAgentRunsForThesis(userId, thesisId): Promise<AgentRun[]>` — ownership-scoped (join through `theses.userId`), newest first. (The other reads — `getAgentRunForUser`, `listIterations`, `listEvidenceForRun` — already exist.)

## Components (`components/agent/`)

- **`AnalyzeNowButton.tsx`** (client) — replaces the Phase-2 disabled/tooltip button; calls `triggerAgentRun(thesisId)` via `useTransition`, toasts on error, `router.refresh()` on success. Disabled while a run for this thesis is already in progress.
- **`AgentRunPanel.tsx`** (client) — rail "Analysis" content: the latest run as a compact card (status pill, live `N iterations · M evidence · ~$cost`, relative time, "View trace →" link to the sub-route) + a short list of prior runs (each linking to its trace). Empty state when no runs. Hosts the polling wrapper.
- **`useRunPolling` (or a `<PollWhileRunning>` wrapper)** — `useEffect` interval calling `router.refresh()` every 3s while a passed-in status is non-terminal; clears on terminal/unmount. One small, testable unit (the terminal-status predicate is pure and unit-tested).
- **Trace view** (`app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`, Server Component) + presentational pieces:
  - `RunHeader` — sticky: status pill, ticker, `iterations · evidence · ~$cost · duration`.
  - `IterationCard` — node + reasoning (summarized thinking) + tool calls + inline evidence; running-pulse when active.
  - `ToolCallBlock` — collapsible; `web_search`/`web_fetch`/`edgar`/`return_result`; brick "refused"/error treatment when the tool result was an error.
  - `EvidenceCard` — source domain + `claim N` tag + extracted text (green left-accent; no impact color yet — evaluation is Phase 4).
- **`lib/agent/cost.ts`** — `estimateRunCostUsd(inputTokens, outputTokens)` using Opus 4.8 pricing ($5 / $25 per 1M). Pure, TDD'd. Also `formatUsd`.
- **`lib/agent/trace.ts`** — small pure helpers to read our `tool_calls` jsonb shape and the Anthropic `response_content` blocks (extract thinking text, tool_use blocks, text) defensively for rendering. Pure, unit-tested.

## Motion

Use **Motion** (framer-motion) for the trace's signature moments — iteration/evidence cards spring/fade in as polling reveals them, cross-fade on status change, the running-node pulse. **New dependency — requires approval** (CLAUDE.md lists Motion as reach-for-when-relevant; this is the relevant case). Keep it to one or two thoughtful moments per DESIGN.md; no gratuitous animation.

## Error / empty / edge states

- **No runs:** rail shows "No analysis yet" + enabled "Analyze now".
- **queued/running:** pulsing status, live counts via polling, "Analyze now" disabled.
- **partial** (budget/iteration cap): amber "Partial" pill + the `reason`; trace still fully viewable.
- **failed:** calm brick "Failed" pill + the `error` text; trace shows whatever iterations were persisted.
- **Trace not owned / missing:** `notFound()`.
- **Malformed/partial jsonb** in an iteration: the trace helpers render defensively (skip unknown blocks) rather than throwing.

## Testing (TDD targets — infra-free)

Per CLAUDE.md, logic-bearing pieces are TDD'd; UI rendering can wait.
- **`lib/agent/cost.ts`** — pricing math + formatting (e.g. 1M in + 1M out → "$30.00"; small runs round sensibly).
- **`lib/agent/trace.ts`** — extracting thinking/text/tool_use from `response_content`; reading the `tool_calls` shape; defensive handling of missing fields.
- **polling predicate** — `isTerminalStatus(status)` true for complete/partial/failed, false for queued/running.
- UI components (run panel, trace timeline): no unit tests this phase; validated via the frontend-design pass + a manual run-through (dev + Inngest dev server + fixtures).

## Verification

`npm run typecheck` + `lint` clean; `npm test` green (the new pure-logic suites); `npm run build` clean (incl. the new sub-route). Manual: with `USE_AI_FIXTURES=1`, `npm run dev` + `npx inngest-cli dev`, click "Analyze now" on a thesis → watch the run card go queued→running→complete with evidence + cost, open the trace → immersive timeline renders with reasoning, tool calls, the inline evidence, and the cost. Exercise the `no-evidence` scenario for the empty-evidence trace.

## Definition of done

All of Verification green; the trace view passes an honest design pass against the Linear bar; DESIGN.md's "Agent run trace view" section filled with the locked decisions + a dated decisions-log entry; new env vars (none); each change approved before commit (CLAUDE.md). Frontend-design skill engaged for the run card / evidence cards / trace view.
