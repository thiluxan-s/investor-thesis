# Phase 5 — Scheduled Runs & Weekly Digest — Design Spec

**Date:** 2026-06-14
**Status:** Approved for planning
**Goal:** Every active thesis is analyzed automatically on a weekly schedule. After all of a user's scheduled runs complete, they receive one email digest summarizing only the theses that changed that week.

**Prerequisite:** Phase 4 (evaluator + thesis health) — merged.

---

## 1. Scope & sub-phase split

Delivered in two sub-phases, mirroring the 4a/4b rhythm. This spec covers the whole phase; `writing-plans` produces the **5a** plan first.

- **Phase 5a — Backend (no new UI):** schema migration; Inngest weekly cron + scheduler; sentinel-based completion coordination; the summarizer agent (prompt + schema + fixtures); Resend client + React Email template; the digest generator; the on-demand "run now" trigger action.
- **Phase 5b — UI:** "Last analyzed" timestamp on theses; a notification-preferences page (toggle `digest_enabled`); a "Run analysis now" button wired to the on-demand trigger.

### Out of scope (YAGNI for v1)
- Notification channels other than email (the `lib/notifications/` adapter is a later seam; one boolean now).
- Per-user schedule customization (cadence/day/time) — fixed Sunday 09:00 UTC.
- Digest history / "past digests" UI.
- Unsubscribe-link / token flow in the email (the in-app toggle is the control for v1).
- Retrying a failed individual thesis run from the digest layer (Inngest step retries already cover transient failures).

---

## 2. Data model

Drizzle migration: one column on `users`, one new table, one column on `agent_runs`.

### `users.digest_enabled`
`boolean not null default true`. Checked by the digest generator; when false, the batch is marked `skipped` and no email is sent. (Scheduling still runs — see §10.)

### Table: `digest_batches`
One row per `(userId, weekOf)` — the sentinel that coordinates "all runs complete."

```ts
{
  id: uuid (pk, defaultRandom)
  userId: uuid (fk → users.id, on delete cascade)
  weekOf: date (notNull)                    // the scheduled Sunday (UTC date)
  expectedRuns: integer (notNull)           // # active theses scheduled for this user this week
  completedRuns: integer (notNull, default 0)
  status: digest_batch_status (notNull, default 'pending')   // 'pending' | 'sent' | 'skipped'
  digestSentAt: timestamptz (nullable)
  createdAt / updatedAt: timestamptz
}
```
- **Unique** on `(userId, weekOf)` — re-running the scheduler for the same week upserts the row rather than duplicating.
- `digest_batch_status` is a `pgEnum` with a client-safe tuple + drift-guard test (the established enum pattern).

### `agent_runs.digest_batch_id`
`uuid (nullable, fk → digest_batches.id, on delete set null)`. Scheduled runs carry it; manual runs leave it null (so manual runs never touch a batch). This is how a run, on completion, knows which batch to increment.

---

## 3. Cron & scheduler

Two Inngest functions, split so the on-demand trigger and the cron share scheduling logic.

1. **`weekly-cron`** — cron trigger `0 9 * * 0` (Sunday 09:00 UTC). Guard: if `serverEnv.SCHEDULED_RUNS_ENABLED` is not true, return `{ status: 'disabled' }`. Otherwise `step.sendEvent('scheduled-runs.requested', { weekOf })` where `weekOf` is today's UTC date. The cron does no DB work itself — it only emits, so the scheduling path is identical to the on-demand trigger.

2. **`schedule-runs`** — triggered by `scheduled-runs.requested { weekOf, userId? }`.
   - If `userId` is present (on-demand path) → schedule that one user. If absent (cron path) → enumerate **all users with ≥1 active thesis** and schedule each.
   - Per user, call the shared `scheduleUserBatch(userId, weekOf)`:
     - Load the user's **active** theses (status = 'active').
     - If zero → no batch, skip.
     - Upsert a `digest_batches` row `(userId, weekOf)` with `expectedRuns = activeTheses.length`, `completedRuns = 0`, `status = 'pending'`.
     - For each active thesis: `createAgentRun(thesisId, 'scheduled')` with `digestBatchId` set, then `inngest.send('agent.run-requested', { agentRunId, thesisId, userId, batchId })`.

The existing `run-agent` → `evaluate-run` path runs unchanged except for threading `batchId` through the event data.

---

## 4. Sentinel coordination & completion (the load-bearing part)

The digest must fire exactly once, after every thesis's **full pipeline** (run **and** evaluation) is done — and must not hang when a run produces no evidence.

- A scheduled run reaches "pipeline complete" at one of two points:
  - **Evidence > 0:** at the end of `evaluate-run` (health deltas are persisted *before* the digest reads them — closes the stale-health race).
  - **Evidence = 0:** at the end of `run-agent` (no `agent-run.completed` is emitted, so no evaluation will run; waiting for it would hang the batch forever).
- Both call one shared step, `recordBatchProgress(batchId)`, which atomically `UPDATE digest_batches SET completed_runs = completed_runs + 1 WHERE id = batchId RETURNING completed_runs, expected_runs`. The single UPDATE is atomic in Postgres; exactly one increment brings `completed_runs` to `expected_runs`. When it does, emit `digest.requested { userId, batchId }`.
- **Idempotency:** the increment lives in its own Inngest `step.run`, so a function retry does not re-execute a completed step (Inngest memoizes step results). As belt-and-suspenders, the digest generator's first action is an atomic status guard (`UPDATE … SET status='sent'/'skipped' WHERE id=batchId AND status='pending' RETURNING …`); if it matches no row, another invocation already handled this batch → stop. This guarantees at-most-once email even if `digest.requested` is delivered twice.

`weekOf`/`batchId` propagation: `batchId` rides in the `agent.run-requested` event data → echoed into `agent-run.completed` → available in `evaluate-run`. Manual runs carry no `batchId`, so the progress step is a no-op for them.

---

## 5. Summarizer agent

A fourth agent role — the "summarizer" ARCHITECTURE.md anticipated as an extension seam.

`lib/ai/agents/summarizer.ts` exports `summarize(input, deps): Promise<DigestResult>`.
- **One-shot, no loop.** A single Messages API call with a forced `return_digest` tool (`tool_choice`), thinking off — same shape as the evaluator (reuses the `createMessage` overrides from Phase 4a).
- **Model:** `claude-sonnet-4-6` (a writing/summarization task at digest scale; cheap, fixture-backed in dev).
- **Input:** one entry per **changed** thesis → `{ title, ticker, positionDirection, healthBefore, healthAfter, newEvidence: [{ sourceDomain, extractedText, topImpact }] }`.
- **Output schema** (`lib/ai/schemas/digest.ts`, Zod): `DigestSchema = { theses: [{ thesisId: string, blurb: string.min(1) }] }`. Validated on the way out. Each `blurb` is 2–4 sentences (enforced by prompt, not schema).
- **Prompt** in `lib/ai/prompts/summarizer.ts` (`systemPrompt`, `buildDigestTask`, `SUMMARIZER_PROMPT_VERSION`). Tone: factual, concise, "what changed and why it matters for the thesis"; no hype, no filler.
- **Fixtures:** `USE_AI_FIXTURES=1` short-circuits with a recorded digest keyed by scenario (mirrors evaluator fixtures).

---

## 6. Digest generator

`lib/inngest/functions/generate-digest.ts`, triggered by `digest.requested { userId, batchId }`.

1. **Status guard** (§4) — atomically claim the batch; stop if already handled.
2. **Prefs** — load the user; if `!digest_enabled` → set `status='skipped'`, stop (no email).
3. **Change selection** — a pure function `selectChangedTheses(batch, runs, evidence, snapshots)` in `lib/digest/select.ts`: for each thesis scheduled in this batch, a thesis is **changed** if its batch run produced new evidence **or** its overall health score moved (this batch's snapshot vs the prior one). Returns the per-thesis digest input (§5) with `healthBefore`/`healthAfter` and the new evidence. Pure → unit-tested.
4. **Quiet week** — if no theses changed → `status='skipped'`, no email.
5. **Summarize** — one `summarize(...)` call (fixture-backed in dev).
6. **Send** — render the React Email template and `sendDigestEmail({ to: user.email, … })`. On success set `status='sent'`, `digestSentAt=now`.

All orchestration in Inngest `step.run`s (each step memoized/retried independently). No new Server Actions.

---

## 7. Resend & email template

- `lib/resend/client.ts` — thin wrapper exporting `sendDigestEmail({ to, subject, react })`. Resend is constructed from `serverEnv.RESEND_API_KEY`; `from` = `serverEnv.RESEND_FROM_EMAIL`.
- **Template** `emails/WeeklyDigest.tsx` (React Email components, not HTML strings). Header + one section per changed thesis: ticker + title, a health-delta chip (before → after, reusing the health color language), the summarizer blurb, and a link back to the thesis detail page (absolute URL from `NEXT_PUBLIC_APP_URL`). Footer notes the in-app toggle to turn digests off.
- Recipient is always `users.email` — **no hardcoded personal address**; `RESEND_FROM_EMAIL` is a generic configured sender.
- New env (added to `lib/env.server.ts` + `.env.example`): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SCHEDULED_RUNS_ENABLED` (boolean), `NEXT_PUBLIC_APP_URL` (for email links).

---

## 8. On-demand trigger

A Server Action `triggerWeeklyDigestNow()` (authenticated): emits `scheduled-runs.requested { weekOf, userId: <current user> }`, where `weekOf` is the **most recent Sunday on or before today (UTC)** — the same value the cron uses for the current week, so on-demand and scheduled runs share one batch key. This schedules only the **current user's** active theses through the exact same `scheduleUserBatch` path, so the full cron→runs→sentinel→digest flow can be demoed live without enabling the global cron or waiting for Sunday. Re-triggering the same week upserts the batch (unique constraint) and re-runs — acceptable for a demo affordance. `weekOf` is computed by one shared helper (`currentWeekOf()`) used by both the cron and this action.

---

## 9. UI (Phase 5b)

Follows the established design language; engage the frontend-design skill per surface, design pass after.

- **"Last analyzed"** — derived from each thesis's latest **terminal** agent run's finish time (no new column; a repo helper returns it alongside the list/detail data). Shown on the thesis list rows and detail header as a relative time ("Analyzed 2d ago" / "Never analyzed").
- **Notification preferences** — a `/settings` page (new top-level route in the app group) with a single toggle for `digest_enabled` (Server Action), written to be extensible to future channels. Includes a one-line explanation of the weekly digest.
- **"Run analysis now"** — a button (on `/settings` or the dashboard) calling `triggerWeeklyDigestNow()`, with a toast confirming the batch was queued and a note that the digest emails when the runs finish.

---

## 10. Error handling & edge cases

- **Scheduling vs prefs:** `digest_enabled` gates the **email**, not the analysis. Scheduled runs still execute for active theses (the dashboard/health stays current); a user with digests off simply gets no email (batch → `skipped`). *(If we'd rather skip analysis too for opted-out users, that's a one-line filter — flagged as a deliberate choice to keep analysis running.)*
- **No active theses for a user:** no batch created; nothing to do.
- **Zero-evidence run:** increments the sentinel via `run-agent` (no evaluation); contributes no change; excluded from the digest.
- **All runs quiet:** batch → `skipped`, no email (avoids empty digests).
- **Summarizer API error / malformed output:** Inngest step retries the API error; on persistent Zod-invalid output, fail the step (the batch stays `pending` and is visible as unsent) rather than emailing garbage — surfaced for inspection, not silently dropped.
- **Resend failure:** Inngest step retry; if it ultimately fails, the batch stays `pending` (not marked `sent`) so it's diagnosable.
- **Duplicate `digest.requested`:** the §4 status guard makes the email at-most-once.
- **Cron disabled:** `weekly-cron` returns early; the on-demand trigger still works (independent of the flag) for demos.

---

## 11. Testing (TDD)

- `digest_batch_status` enum drift-guard test.
- `DigestSchema` validation (accepts valid, rejects empty blurb / missing thesisId).
- `selectChangedTheses` pure function: new-evidence-only change, health-delta-only change, no change (excluded), health before/after correctness.
- Summarizer fixture test (recorded scenario → expected structured digest).
- Sentinel: `recordBatchProgress` brings a batch to complete exactly once; the status guard rejects a second claim.
- Extend the offline harness so a fixtured scheduled batch runs end-to-end (scheduler → runs → sentinel → digest selection → summarizer → a captured email payload, not actually sent).
- Email rendering + actual send verified manually to a real address before shipping (per the phase doc); UI tests deferred per CLAUDE.md.

---

## 12. Cost & free-tier awareness

- **Anthropic:** one summarizer call per user per week (cheap Sonnet, small I/O) on top of the scheduled researcher+evaluator runs. The standing weekly researcher/evaluator spend is the real cost — bounded to active theses and gated by `SCHEDULED_RUNS_ENABLED` (default off in prod; flip on deliberately). Dev always uses fixtures.
- **Inngest:** added functions (cron, scheduler, generate-digest) + the per-run sentinel step add a handful of steps per batch — comfortably within 50k/month.
- **Resend:** one email per user per active week — negligible against 3,000/month.
- **Neon:** `digest_batches` is one row per user per week; `agent_runs.digest_batch_id` is a column. Negligible.

---

## 13. File map

```
lib/db/schema.ts                                 # users.digest_enabled, digest_batches, digest_batch_status enum, agent_runs.digest_batch_id
schemas/digest-batch.ts                          # DIGEST_BATCH_STATUSES tuple (+ drift test)
lib/db/repositories/digest-batches.ts            # upsertBatch, recordBatchProgress, claimBatchForSend, getBatch
lib/db/repositories/users.ts                     # add setDigestEnabled / digest_enabled read (extend existing)
lib/db/repositories/agent-runs.ts                # createAgentRun gains optional digestBatchId; lastAnalyzedAt helper
lib/inngest/client.ts                            # event types: scheduled-runs.requested, digest.requested (+ batchId on existing)
lib/inngest/functions/weekly-cron.ts             # cron trigger + guard
lib/inngest/functions/schedule-runs.ts           # scheduleUserBatch (all users or one)
lib/inngest/functions/run-agent.ts               # thread batchId; sentinel on zero-evidence
lib/inngest/functions/evaluate-run.ts            # thread batchId; sentinel on completion
lib/inngest/functions/generate-digest.ts         # status guard → select → summarize → send
app/api/inngest/route.ts                         # register the new functions
lib/ai/agents/summarizer.ts                      # one-shot, forced return_digest tool
lib/ai/prompts/summarizer.ts                     # systemPrompt, buildDigestTask, SUMMARIZER_PROMPT_VERSION
lib/ai/schemas/digest.ts                         # DigestSchema, return_digest tool
lib/ai/digest-fixtures.ts                         # offline summarizer replay
lib/digest/select.ts                             # selectChangedTheses (pure)
lib/resend/client.ts                             # sendDigestEmail
emails/WeeklyDigest.tsx                           # React Email template
lib/env.server.ts / .env.example                 # RESEND_API_KEY, RESEND_FROM_EMAIL, SCHEDULED_RUNS_ENABLED, NEXT_PUBLIC_APP_URL
app/(app)/theses/agent-actions.ts                # triggerWeeklyDigestNow (on-demand)
app/(app)/settings/page.tsx                      # 5b — prefs page + run-now button
components/theses/ThesisRow.tsx / detail page     # 5b — "Last analyzed"
```
