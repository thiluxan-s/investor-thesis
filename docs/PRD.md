# PRD — Thesis Tracker

## Problem

When you take a position in a stock, you write down (or at least mentally hold) the reasoning: "I'm long NVDA because data center demand is structural, CUDA is a moat, and the next 4 quarters of earnings will show >40% YoY growth in their data center segment." Then time passes. Earnings come out. News breaks. Competitors announce things. Your thesis is supposed to evolve — but in practice most investors don't track it deliberately. They either hold on too long (thesis quietly broke months ago) or sell too early (transient noise read as a thesis failure).

The problem isn't lack of information. The problem is the cognitive load of *continuously evaluating evidence against a thesis* while doing everything else in life.

## Solution

You write your thesis as structured claims. An AI agent watches the world for you. On a recurring schedule, it gathers new evidence (news, SEC filings, IR releases, earnings), evaluates each piece against your claims, and updates a "thesis health" view. You see — at a glance, with full citations — whether the world is still agreeing with your thesis or not.

This is not a tool that tells you to buy or sell. It's a tool that helps you *think clearly* about positions you already hold.

## Target user (v1)

Self-directed retail investors who:
- Take meaningful positions in individual stocks (not pure index investors)
- Write or could articulate the reasoning behind their positions
- Are comfortable with web tools and AI products
- Don't have a Bloomberg terminal but wish they had something between "nothing" and "$24k/year"

Specifically: me, and people like me. Anchoring on the target user gives the demo authenticity. A recruiter who is themselves an investor will instantly recognize the value.

## Non-goals (explicitly)

- **Not a robo-advisor.** We don't recommend positions, don't generate theses, don't tell users to buy or sell. The user owns the thesis; we track it.
- **Not a market data terminal.** No real-time prices, no charts, no technical indicators. Other products do this well.
- **Not a portfolio tracker.** We track *theses*, not P&L. You can have a thesis on a stock you don't own.
- **No trade execution.** Ever.
- **No alpha generation.** We're explicit: this is a *reasoning* tool, not a *predicting* tool.
- **No mobile native apps in v1.** Responsive web only.
- **No Bloomberg/Refinitiv/Koyfin integration.** Free web sources (news search, SEC EDGAR) only — keeps the demo unblocked and the project ownable.

## v1 scope — what ships in 6 weekends

A signed-in user can:
1. Create a thesis for a ticker, with a position direction (long/short), time horizon, and 2-5 structured claims. Two authoring modes:
   - **From scratch** — type each claim manually.
   - **From a paragraph** — paste a free-text reasoning ("I'm long NVDA because data center demand is structural and CUDA is a moat...") and have an AI extract structured claims with categories that the user reviews and edits before saving.
2. From the landing page, click "Try the demo" to view a pre-seeded thesis (read-only) without signing up. The dashboard is the demo.
3. View a list of their theses and click into one for the full dashboard.
4. Trigger an "analyze now" run manually — agent gathers fresh evidence, evaluates against claims, updates state.
5. See the thesis dashboard:
   - Each claim with a health indicator (strengthening / neutral / weakening), based on evidence accumulated.
   - Evidence timeline showing every piece collected, with source link, extracted text, agent's reasoning, and impact on which claim — via a per-claim drill-down that decomposes a claim's health score into the evidence that produced it.
   - Agent run history — every run is inspectable (what it searched, what it found, what it skipped).
6. Edit claims (re-evaluations are queued automatically).
7. Receive a weekly digest by email — "this week, here's what changed about your thesis."
8. Delete a thesis (cascades cleanly).

That's it.

## v2 — written down so we don't forget, but explicitly not built in v1

- **Public read-only thesis sharing.** Real feature but adds policy questions (what's shareable, how to handle privacy, public URLs) and zero core demo value.
- Conversational Q&A about a thesis ("what was the strongest piece of evidence last month?")
- Multi-source addition: Reddit/Twitter/podcasts, paid data via API
- Backtesting ("if I had this tool 6 months ago, would it have helped?")
- Tagging and comparing theses
- Mobile native
- Team / club mode (shared theses)
- Notifications beyond weekly (immediate alerts for high-impact evidence)
- Additional drafting modes (template-based; AI-generated full thesis from ticker)

## Success criteria

This is a portfolio piece. Success is measured by what it demonstrates:

1. **The demo lands in under 90 seconds.** Recruiter signs in → sees a pre-seeded thesis (mine, on a real ticker) → sees the dashboard with real evidence and a real agent trace → reads one "agent reasoning" snippet → understands the value.
2. **The agent's reasoning is inspectable.** The "agent run" view should be the most interesting thing on the site — clicking through one shows the loop in action. This is the differentiator from every other LLM project.
3. **The README sells it.** Architecture diagram with the agent loop visible. Screenshots of the dashboard. Design decisions section that names trade-offs (why a hand-written loop, why two-agent, why pgvector, why no framework). Live link to a deployed demo with a pre-seeded thesis.
4. **It looks like a real product, not a demo.** Real empty states, real loading states, real failure modes ("agent couldn't fetch that source — here's why"). No Lorem Ipsum, no placeholder routes.

## Constraints

- **Free tier only** for infrastructure. Anthropic API is pay-as-you-go (no free tier).
- **Solo, weekends only.** Aggressive scope discipline.
- **Pre-seeded demo data.** A recruiter shouldn't have to write a thesis to see value. A demo thesis with real evidence trail must be visible without sign-up.

## Key decisions and the reasoning

- **Why investment theses, specifically equities?** Most concrete demo. Tickers give the agent obvious anchors (10-Ks, earnings dates, IR pages, company news). Macro theses (which we considered) would force the agent to chase fuzzier sources. Equity-specific = better demo, simpler agent design.
- **Why a hand-written agent loop, not LangChain/Mastra?** Portfolio differentiator. The loop is the most interesting thing in this codebase; a framework hides it. In interviews I want to be able to say "here's my loop, here's the stop condition, here's how I handle each failure mode" — not "I configured a LangChain pipeline."
- **Why two agents (researcher + evaluator), not one?** Anthropic's own engineering guidance: a model evaluating its own work is too generous. Separation produces better evaluations and makes each prompt simpler. Also: cleaner story in interviews.
- **Why scheduled weekly runs instead of continuous monitoring?** Weekly is the right cadence for thesis tracking — it matches how investors actually think (not minute-to-minute). Daily would burn tokens and create alert fatigue. Weekly digests are a UX strength, not a limitation.
- **Why pgvector and not Pinecone/Weaviate?** If embeddings ever get wired up, they'd be for dedup and similar-evidence lookup, not large-scale vector search — Postgres is already there, so pgvector is plenty and costs nothing extra. To be clear about what shipped: the embedding column is declared and reserved, and nothing writes or reads it yet. Enabling it would also mean adding an embedding provider, since Anthropic doesn't offer one.
- **Why public sharing as a stretch, not in v1?** It's a real feature but it adds policy questions (what's shareable, how to handle privacy, public URLs) and zero core demo value. Stretch goal preserves the option without bloating v1.
- **Why no chat interface?** Chat is for synchronous Q&A. Our agent runs in the background and produces structured artifacts over time. A dashboard is the right shape. A chat UI would also make the demo less impressive — chat with AI is table stakes; an autonomous agent that writes its own status reports is not.
- **Why AI-assisted drafting via paragraph extraction (not template-based or full AI generation)?** Two reasons. First, it mirrors how investors actually think — in paragraphs, not bulleted claims. Second, the user *owns* the thesis: the input is their own words, the AI just structures them. This preserves the "user reasoning, AI evaluation" framing that differentiates us from AI-stock-picking products. Template-based or full AI-generated theses would dilute that.
- **Why the "Try the demo" pre-seeded path?** The biggest UX risk for this product is that a recruiter sees a sign-up wall and bounces. A read-only pre-seeded thesis on a famous ticker (likely NVDA) lets them see the value in 10 seconds. The full feature still requires sign-up; the demo doesn't.
- **Why the same stack as Wayfare (mostly)?** I've now shipped this stack. Switching frameworks/databases mid-portfolio for the sake of "range" would be performative. The agent layer is where this project differentiates, not the choice of ORM.
