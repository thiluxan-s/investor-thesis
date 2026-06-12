# Phase 4 — Evaluator and Thesis Health

**Goal:** Every piece of evidence the agent finds gets evaluated against every claim. The thesis dashboard shows health indicators per claim and overall. Charts show how health has evolved over time.

**Prerequisite:** Phase 3 complete.

## Deliverables (high level)

1. Schema addition: `claim_evidence_links`.
2. Repository for evaluations.
3. `lib/ai/agents/evaluator.ts` — single-call evaluator. No loop.
4. `lib/ai/prompts/evaluator.ts` — system prompt and task template.
5. Inngest function `evaluate-evidence.ts` — triggered after agent runs complete; for each new (claim, evidence) pair, calls the evaluator.
6. `lib/health/` — pure functions for health calculation (weighted by confidence, decayed over time).
7. Trigger on evidence creation: send `evidence.collected` event, evaluator function picks up.
8. UI updates:
    - Each claim card shows a health indicator (-1 to +1 bar, color-coded).
    - Each evidence card shows which claims it strengthens/weakens and the evaluator's reasoning.
    - Thesis-level health (rolled up from claims) on the list view.
    - Time-series chart (Recharts) showing thesis health evolution.

## Notes for when we get here

- The evaluator prompt is critical — it should be conservative (default to "neutral" with low confidence rather than picking a side without strong evidence). Calibrate with the demo thesis's evidence.
- Cache evaluations by (claim_id, evidence_id, prompt_version). Re-evaluating the same pair on the same prompt version is waste.
- The time-series chart needs care — it shows health at points in time, which means computing historical health from agent run timestamps. Pre-compute and store snapshots, or compute on the fly?

---

(More detail to be added before starting this phase.)
