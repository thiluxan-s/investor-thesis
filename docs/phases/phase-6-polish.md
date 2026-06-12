# Phase 6 — Polish, Demo, Ship

**Goal:** The app feels finished. The README is great. Demo thesis pre-seeded. Drafting feature shipped. Deployed.

**Prerequisite:** Phase 5 complete.

## Deliverables (high level)

1. **AI-assisted thesis drafting (paragraph → structured claims).** New tab in the new-thesis flow. User pastes a paragraph; drafter agent extracts 2-7 candidate claims with categories and source-excerpt highlights; user reviews, edits, and selects 2-5 to save. See `ARCHITECTURE.md` "The drafter" section for design and contract.
   - `lib/ai/agents/drafter.ts` — one-shot agent.
   - `lib/ai/prompts/drafter.ts` — system prompt and task template.
   - `lib/ai/schemas/drafter.ts` — Zod schema for drafted claims.
   - Server Action: `draftClaimsFromParagraph(input)` — validates, calls drafter, returns drafted claims (does NOT save them).
   - UI: tabbed new-thesis flow ("Manual" vs. "From paragraph"). Claim cards in review state are editable.
2. **"Try the demo" landing path.** Landing page button that takes the visitor directly to a pre-seeded public read-only thesis dashboard without sign-up. Implementation: a designated demo-user account, a single hardcoded thesis ID, app-level read-only enforcement on that account.
3. **Landing page polish.** Hero, screenshot of dashboard, screenshot of agent trace, "Try the demo" CTA, "Sign up" CTA.
4. **Demo seed.** Real thesis on a real ticker (likely NVDA) with real evidence, real evaluations, real history. The pre-seeded user is read-only via app-level enforcement; no write actions for that account. Re-seedable via a script so the demo can be refreshed.
5. **Loading and empty states everywhere.** Audit every screen.
6. **Mobile pass.** Every screen on a phone.
7. **Failure modes.** What happens when the agent finds nothing? What if Anthropic is down? What if the user has 0 theses? What if the drafter returns 0 claims (paragraph too vague)?
8. **README rewrite.** Architecture diagram with the agent loop highlighted (and now three agents to feature). Screenshots. Design decisions section explicitly naming choices and trade-offs. Live demo link with "no sign-up required" call-out. "What I'd build next" roadmap from PRD's v2.
9. **Demo video.** 90 seconds: visit landing page → "Try the demo" → show the dashboard → click latest agent run → scroll trace → close → click "Sign up" → quick walkthrough of paragraph-based drafting. Embed in README.
10. **OG image and favicon.** Custom so the link previews well.
11. **Accessibility pass.** Keyboard nav, focus states, contrast.
12. **Final deploy.** Custom domain optional but nice.

## Notes for when we get here

- The drafting UX is a high-leverage demo moment — make it feel magical. Stream the drafter's output, animate claim cards appearing, highlight the source paragraph as each claim is extracted. The frontend-design skill should handle most of this.
- The "Try the demo" page should *not* feel like a watered-down dashboard. It should feel like the real product with a single thesis already there. The only difference is a banner ("This is a demo thesis. Sign up to create your own.") and read-only enforcement on writes.
- The README is the most-read artifact. Spend real time on it. Look at the Wayfare README's flaws after Phase 6 (placeholder URL, outdated phase list) and don't repeat those mistakes.
- The architecture diagram should specifically show the agent loop, the three-agent separation, and the extension seams. The seams are a genuine differentiation for senior interviews.
- A "design decisions" section in the README is unusually valuable for a senior portfolio piece. Examples worth naming: hand-written loop (not LangChain), three agents (not one), paragraph-based drafting (preserving user reasoning over AI-generated theses), pgvector (not Pinecone), deterministic health calc (not AI), weekly schedule (not real-time).

---

(More detail to be added before starting this phase.)
