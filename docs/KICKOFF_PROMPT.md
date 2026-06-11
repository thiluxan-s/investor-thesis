# Kickoff prompt for Claude Code

Copy-paste this into the first Claude Code session in the empty repo.

---

We're starting a new project called **Thesis Tracker**. It's an AI-agent-powered tool that watches the world for evidence strengthening or weakening an investor's thesis. The user writes a structured thesis (a stock position + 2-5 claims supporting it). A researcher agent runs on a schedule, autonomously gathers evidence from the web, and a separate evaluator model judges each piece against each claim. The user sees a thesis dashboard with health scores, evidence trails, and inspectable agent run traces.

This is my second portfolio project. The first is Wayfare (https://github.com/thiluxan-s/TravelApp) — a travel "second brain" that does one-shot AI extraction from PDFs. Thesis Tracker is the agentic-AI complement to that: a real loop, not one-shot. The contrast between the two projects is intentional.

I have **Superpowers**, **Context7**, and **frontend-design** plugins installed. Use them. Brainstorm before coding, plan before implementing, TDD during implementation, Context7 for library docs, frontend-design for UI work. Don't ask permission to use them — they're the workflow.

**Important workflow change from Wayfare:** I want you to pause for my explicit approval before staging or committing any code. This applies to every commit, including docs and scaffolding. See `CLAUDE.md` for details.

I've placed reference documents in `docs/` along with a root `CLAUDE.md`. **Before you write any code, read all of these in order:**

1. `CLAUDE.md` — conventions, anti-patterns, the approval workflow, the frontend quality bar, who I am.
2. `docs/PRD.md` — what we're building, who it's for, what's explicitly out of scope.
3. `docs/ARCHITECTURE.md` — system design with detailed Agent Design section. **Pay extra attention to the Agent Design section** — it's the heart of this project and the most subtle part.
4. `docs/DATA_MODEL.md` — schema with rationale.
5. `docs/DESIGN.md` — visual design principles, reference apps, per-screen decisions log. Read before any UI work; update as decisions get made.
6. `docs/phases/phase-1-foundation.md` — exactly what we're doing this phase.

After reading, before you touch any code, summarize back to me in 5-10 bullets:

- The one-line goal of the project.
- The locked-in tech stack.
- The two-agent architecture in one sentence (researcher vs. evaluator).
- Three conventions from `CLAUDE.md` you'll be especially careful to follow.
- Two anti-patterns you'll specifically avoid.
- How the approval workflow changes the way you work this time vs. how I described Wayfare.
- The Phase 1 deliverables (high level).
- Any contradictions, ambiguities, or things you want me to clarify before starting.

Then wait for me to confirm before you start.

---

## Starting subsequent phases

For phase 2 and beyond, start a fresh session and say:

> We're starting Phase N. Read `CLAUDE.md`, then re-skim `docs/ARCHITECTURE.md` (especially the Agent Design section if relevant to this phase) and `docs/DATA_MODEL.md` for any changes since last session. Then read `docs/phases/phase-N-*.md` in full. Summarize the phase deliverables and flag anything ambiguous before starting.

This forces re-anchoring on the conventions every session, which matters because Claude Code sessions don't share memory.

## When you hit a decision point mid-phase

If Claude proposes something that contradicts a doc, the doc wins — unless we explicitly decide to update the doc. Don't let convention drift happen silently.

If Claude proposes something the docs don't cover, that's fine — but if it's a meaningful choice (a new library, a new pattern, a new env var), it should be flagged so you can decide consciously and update the doc.

## Reference: Wayfare

When questions come up about "how did Wayfare handle X?", the repo is at https://github.com/thiluxan-s/TravelApp. Conventions, file structure, and workflow should feel consistent with Wayfare unless this project's docs explicitly differ.
