# nvda-challenge (provisional)

**This scenario is hand-authored for offline testing and has not yet been recorded from a
live run.** The messages, tool results, evaluations, and challenge brief in this directory
are plausible but fabricated — no Anthropic call, web search, or web fetch produced them.

It exists so `USE_AI_FIXTURES=1` can exercise the challenge-mode researcher loop, the
evaluation pipeline, and `writeChallengeBrief` end-to-end without spending real API tokens.

**Before this scenario is used to seed anything user-facing (in particular the `/demo`
seed in Phase 7b), it must be replaced by a real recording.** Record it by running, with
approval, `--live` against a real thesis:

```bash
node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge \
  --live --thesis <demo-thesis-id>
```

This calls the live Anthropic API against a real NVDA thesis and spends real money.
`--thesis` is not optional here: `claim_indices` and the brief's `claim_index` are
positional into that thesis's ordinal-ordered claim list, so recording against a
different claim set silently maps arguments onto the wrong claims — the indices stay
in range, so nothing errors. `--live` also refuses to run with `USE_AI_FIXTURES=1` set,
and prompts for typed confirmation before it spends anything.

The harness writes only the fixture files whose sink was non-empty this run — it will
not stomp `challenge-brief.json` or `digest.json` with unreadable content if the brief
or digest pipeline had nothing to write this time. Once a real recording lands (all five
files populated), replace this provisional content and delete this warning.
