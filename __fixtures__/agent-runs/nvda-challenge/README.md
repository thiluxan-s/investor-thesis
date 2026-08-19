# nvda-challenge (provisional)

**This scenario is hand-authored for offline testing and has not yet been recorded from a
live run.** The messages, tool results, evaluations, and challenge brief in this directory
are plausible but fabricated — no Anthropic call, web search, or web fetch produced them.

It exists so `USE_AI_FIXTURES=1` can exercise the challenge-mode researcher loop, the
evaluation pipeline, and `writeChallengeBrief` end-to-end without spending real API tokens.

**Before this scenario is used to seed anything user-facing (in particular the `/demo`
seed in Phase 7b), it must be replaced by a real recording.** Record it by running, with
approval, and without `USE_AI_FIXTURES`:

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge
```

This calls the live Anthropic API against a real NVDA thesis and spends real money.
Capture the resulting messages, tool results, evaluations, and brief into the four
fixture files here, replacing this provisional content, and delete this warning.
