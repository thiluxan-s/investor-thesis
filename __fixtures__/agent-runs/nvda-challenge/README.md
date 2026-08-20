# nvda-challenge

**Recorded from a live challenge run** against the demo NVDA thesis on 2026-08-20.
The messages, tool results, evaluations, challenge brief, and digest in this directory
are real Anthropic API output — six model turns, twelve tool results from real sources,
twenty-one evaluator verdicts, and a five-point brief.

`USE_AI_FIXTURES=1` replays it to exercise the challenge-mode researcher loop, the
evaluation pipeline, and `writeChallengeBrief` end-to-end without spending API tokens.

## Re-recording

Only needed if the prompts or the tool contract change materially. It spends real money:

```bash
USE_AI_FIXTURES=0 node --conditions=react-server --env-file=.env.local --import tsx \
  scripts/run-agent-fixture.ts nvda-challenge challenge \
  --live --thesis <demo-thesis-id>
```

`--thesis` is not optional. `claim_indices` and the brief's `claim_index` are positional
into that thesis's ordinal-ordered claim list, so recording against a different claim set
silently maps arguments onto the wrong claims — the indices stay in range, so nothing
errors. Record against the demo thesis, whose three claims this scenario's indices assume.

`--live` refuses to run with `USE_AI_FIXTURES=1` set, and prompts for typed confirmation
before it spends anything. An inline `USE_AI_FIXTURES=0` prefix overrides `--env-file`,
which is why the command above works without editing `.env.local`.

**Seed the demo thesis first** (`scripts/seed-demo.ts`, fixtured and free). The brief
pipeline returns `no_weakening_evidence` without calling the model if the thesis has no
standing `weakens` links, and the seeded research run supplies one — so the recording
still produces a brief even if the challenge run itself finds nothing new.

The harness writes only the files whose sink was non-empty. It will not stomp
`challenge-brief.json` or `digest.json` with unreadable content when the brief or digest
pipeline had nothing to write.
