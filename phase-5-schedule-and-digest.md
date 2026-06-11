# Phase 5 — Scheduled Runs and Weekly Digest

**Goal:** Every active thesis gets analyzed automatically on a weekly schedule. After all runs complete for a user, they receive an email digest summarizing what changed that week.

**Prerequisite:** Phase 4 complete.

## Deliverables (high level)

1. Inngest cron function: every Sunday 09:00 UTC.
2. Scheduler function: enumerates active theses across all users, sends `agent.run-requested { trigger: 'scheduled' }` for each.
3. Digest generator function: triggered when all scheduled runs for a user complete; aggregates the week's evidence; one Anthropic call to write a per-thesis digest; sends email via Resend.
4. `lib/resend/client.ts` — Resend wrapper with one function: `sendDigestEmail`.
5. Email template (React Email — same component model as the app) showing per-thesis digests with links back to the dashboard.
6. UI:
    - "Last analyzed" timestamp on each thesis.
    - "Notification preferences" page (toggle email digests on/off, future-proof for more channels).

## Notes for when we get here

- React Email integrates well with Resend. Components, not HTML strings.
- The digest prompt should produce 2-4 sentences per thesis — a digest is not a wall of text.
- Test the email by sending to my real address before shipping. Verify it doesn't go to spam.
- The "all runs complete" trigger is tricky — Inngest functions are independent. Use a sentinel row per (user_id, week_of) that counts completed runs.

---

(More detail to be added before starting this phase.)
