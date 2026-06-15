# Phase 6a — AI Thesis Drafting — Design Spec

**Date:** 2026-06-15
**Status:** Approved for planning
**Goal:** A user can paste a free-text paragraph of their reasoning into the new-thesis flow; a one-shot "drafter" agent extracts 2–7 candidate claims (with categories and the source excerpt each came from) in the user's own words; the user reviews, edits, trims to ≤5, and saves through the existing thesis-creation path.

**Prerequisite:** Phase 5 complete. This is the first sub-phase of Phase 6 (decomposed: 6a drafter, 6b demo path + seed, 6c landing polish, 6d cross-cutting polish/hardening, 6e ship). Later sub-phases get their own specs.

**Reference:** `ARCHITECTURE.md` → "The drafter" (the third agent role and its contract).

---

## 1. Scope

The drafter agent + its prompt/schema/tool/fixtures, a `draftClaimsFromParagraph` Server Action, and a tabbed claims step in the new-thesis wizard. The drafter **structures the user's words** — it does not search, generate opinions, or assess validity.

### Out of scope
- Token-streaming the drafter output and live paragraph-highlight-as-extracted — deferred to **6d** polish. (6a captures `sourceExcerpt` and shows it statically so the data is ready for that pass.)
- The "ticker-only, AI-generates-the-whole-thesis" drafting variant — `ARCHITECTURE.md` marks it v2.
- Saving from the drafter — drafting only *proposes* claims; saving uses the existing `createThesis` path unchanged.

---

## 2. Drafter agent

`lib/ai/agents/drafter.ts` exports `draftClaims(input, deps): Promise<DraftedClaims>`.
- **One-shot, no loop**, identical mechanical shape to the evaluator/summarizer: a single `createMessage` call with a forced `return_drafted_claims` tool (`toolChoice`), thinking **off**.
- **Model:** `CURRENT_MODEL` (Opus 4.8) — the `createMessage` default, no override. A rare, user-initiated call where output quality matters and cost is negligible; `ARCHITECTURE.md` pseudocode specifies `CURRENT_MODEL`.
- **Input:** `{ ticker: string; positionDirection: "long" | "short"; reasoning: string }`.
- **Output** validated with Zod; on malformed/invalid tool output, return `{ claims: [] }` (the UI treats empty as "couldn't draft").

## 3. Schema + tool

`lib/ai/schemas/drafter.ts` (Zod):
```ts
DraftedClaimSchema = {
  statement: string (min 1, max ~500),     // lenient: the user edits before saving
  category: enum(CLAIM_CATEGORIES),         // reuse schemas/thesis.ts tuple
  sourceExcerpt: string,                    // verbatim substring of `reasoning`; may be ""
}
DraftedClaimsSchema = { claims: DraftedClaimSchema[] }   // 0–7
```
`DraftedClaim` / `DraftedClaims` types via `z.infer`. The save path (`CreateThesisSchema`) enforces the real constraints — statement 10–300, **2–5** claims — so drafted claims are intentionally looser; the review UI surfaces validation as the user edits.

`lib/ai/tools/return-drafted-claims.ts` — the forced tool, `inputSchema = DraftedClaimsSchema`, mirroring `return-evaluation` / `return-digest`.

## 4. Prompt

`lib/ai/prompts/drafter.ts` exports `systemPrompt`, `buildDraftingTask(ticker, positionDirection, reasoning)`, `DRAFTER_PROMPT_VERSION = "drafter-v1"`.
- Extract **2–7** claims from the user's reasoning, **in their own words/voice**; assign each a category from the list; set `sourceExcerpt` to the verbatim substring the claim is drawn from.
- Explicit guardrails: *do not introduce reasoning the user didn't provide; do not assess whether claims are true; do not invent evidence.* You MUST call `return_drafted_claims`.

## 5. Fixtures

`lib/ai/drafter-fixtures.ts` (`DrafterFixtureReader`, mirrors `evaluation-fixtures`/`digest-fixtures`) + `__fixtures__/agent-runs/nvda-happy-path/drafter.json` (a recorded `return_drafted_claims` message with sample claims, input-independent). `USE_AI_FIXTURES=1` replays it; offline + zero spend in dev, consistent with the other agents.

## 6. Server Action

`draftClaimsFromParagraph(input)` (in `app/(app)/theses/agent-actions.ts` or a sibling action file):
- `requireUserId` (drafting is in the protected app group).
- Validate: `ticker` via `TickerSchema`, `positionDirection` enum, `reasoning` trimmed `min 30` / `max 2000` chars (a Zod schema `DraftRequestSchema`).
- Pick the client: `USE_AI_FIXTURES` → `DrafterFixtureReader`; else `createAnthropicClient(ANTHROPIC_API_KEY)`.
- Call `draftClaims`, return `ActionResult<{ claims: DraftedClaim[] }>`. **Never saves.** A drafter API error or invalid input returns `{ ok: false, error }` (synchronous action — one attempt, surface the error; no Inngest retry here).

## 7. UI — tabbed claims step

The new-thesis wizard (`components/theses/NewThesisWizard.tsx`) is a 2-step flow (step 1: title/ticker/direction/horizon/status; step 2: claims). Step 2 gains **two tabs**:
- **"Write manually"** — today's `ClaimForm`-based entry, unchanged.
- **"Start from a paragraph"** — a `Textarea` for the reasoning + a "Draft claims" button (disabled until the reasoning meets the min length). On click → `draftClaimsFromParagraph({ ticker, positionDirection, reasoning })` from step 1's values, with a "Drafting…" pending state.

On a successful draft, the returned claims **animate in (Motion) as editable cards merged into the same `claims` state** the manual flow already uses — so editing, deleting, the ≤5 gate, and the save path are all unchanged. Each drafted card shows its `sourceExcerpt` as muted context (`"from: …"`). The user trims to 2–5 and saves.

A small new `components/theses/ParagraphDrafter.tsx` (client) owns the textarea + button + the draft call; it lifts the resulting claims up to the wizard via a callback (e.g. `onDrafted(claims)`), keeping `NewThesisWizard` the single owner of `claims` state.

## 8. Error & empty states

- **Reasoning too short / too long:** the button is disabled below the min; the action also validates and returns `{ ok: false }` defensively.
- **Drafter API error:** toast the error; the textarea + entered claims are preserved.
- **0 claims (vague paragraph) or malformed output → empty:** a calm inline message — "Couldn't draft claims from that — add more detail, or write them manually." — not an error toast.
- **Drafted statement fails save validation** (too short/long): the existing `ClaimForm`/`createThesis` validation surfaces it on edit/save, as it does for manual claims.

## 9. Testing (TDD)

- `DraftedClaimsSchema` validation: valid draft accepted; bad category rejected; empty `claims` array accepted; over-long statement handling.
- `draftClaims` agent unit test (injected `AnthropicLike`): returns the validated claims from the tool call; malformed tool output → `{ claims: [] }`.
- Drafter fixture replay test (recorded scenario → expected claims).
- Server Action input validation (reasoning length bounds) where cheaply unit-testable; UI verified by typecheck/lint + manual (UI tests deferred per CLAUDE.md).

## 10. Cost & free-tier

One Opus call per "Draft claims" click — user-initiated, infrequent, small I/O (~$0.01–0.05). Dev uses fixtures (zero spend). No new tables, no background jobs.

## 11. File map

```
lib/ai/schemas/drafter.ts                          # DraftedClaimSchema, DraftedClaimsSchema (+ test)
lib/ai/tools/return-drafted-claims.ts              # forced return_drafted_claims tool
lib/ai/prompts/drafter.ts                          # systemPrompt, buildDraftingTask, DRAFTER_PROMPT_VERSION
lib/ai/agents/drafter.ts                           # draftClaims (one-shot) (+ test)
lib/ai/drafter-fixtures.ts                         # DrafterFixtureReader
__fixtures__/agent-runs/nvda-happy-path/drafter.json
app/(app)/theses/agent-actions.ts                  # draftClaimsFromParagraph (+ DraftRequestSchema, in schemas/thesis.ts or inline)
components/theses/ParagraphDrafter.tsx             # client: textarea + draft button
components/theses/NewThesisWizard.tsx              # tabbed claims step, merge drafted claims into `claims`
```
