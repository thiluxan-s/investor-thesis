import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { inngest, type AgentRunCompleted } from "@/lib/inngest/client";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { writeBriefForRun } from "@/lib/ai/challenge-pipeline";
import { recordBatchProgress } from "@/lib/db/repositories/digest-batches";
import { serverEnv } from "@/lib/env.server";

// The one scenario that ships a challenge-brief.json.
const CHALLENGE_FIXTURE_SCENARIO = "nvda-challenge";

// A challenge run can arrive carrying any scenario — today's trigger hardcodes
// "nvda-happy-path" — and most scenarios have no challenge-brief.json, whose
// reader throws on construction. Degrade to the challenge scenario, then to
// skipping the brief, rather than burning three step retries on a dev fixture
// that was never going to exist.
function openBriefFixture(requested: string): ChallengeBriefFixtureReader | null {
  for (const scenario of new Set([requested, CHALLENGE_FIXTURE_SCENARIO])) {
    try {
      return new ChallengeBriefFixtureReader(scenario);
    } catch {
      // Try the fallback scenario next; a missing fixture is not a run failure.
    }
  }
  return null;
}

export const evaluateRun = inngest.createFunction(
  { id: "evaluate-run", retries: 2, triggers: [{ event: "agent-run.completed" }] },
  async ({ event, step }) => {
    const { agentRunId, thesisId, userId, scenario, batchId, mode } = event.data as AgentRunCompleted["data"];

    async function settleBatch(): Promise<void> {
      if (!batchId) return;
      const { complete } = await step.run("record-batch-progress", () => recordBatchProgress(batchId));
      if (complete) {
        await step.sendEvent("emit-digest-requested", {
          name: "digest.requested",
          data: { userId, batchId, scenario },
        });
      }
    }

    const thesis = await step.run("load-thesis", () => getThesisForUser(userId, thesisId));
    if (!thesis) {
      await settleBatch();
      return { status: "skipped" as const };
    }

    const useFixtures = serverEnv.USE_AI_FIXTURES;
    // One real Anthropic client per invocation — the evaluator and (on a
    // challenge run) the brief step reuse it rather than each building their
    // own. Fixture-backed clients stay per-consumer below since they read
    // different files (evaluations.json vs. challenge-brief.json).
    const realClient: AnthropicLike | null = useFixtures
      ? null
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);

    // Writes a challenge brief for `challenge`-mode runs. Called on BOTH exits
    // below (no-evidence and evaluated): the brief argues from every weakening
    // link across the thesis (listWeakeningLinksForThesis), not just what this
    // run collected, so a well-covered thesis whose researcher happens to find
    // nothing new this time should still show its standing case, not go silent.
    // A research run returns immediately — it never touches the fixture reader
    // or makes a brief-related API call.
    async function maybeWriteBrief(t: {
      title: string;
      ticker: string;
      positionDirection: string;
      timeHorizon: string;
      claims: { id: string; ordinal: number; statement: string }[];
    }): Promise<void> {
      if (mode !== "challenge") return;
      const briefReader = useFixtures ? openBriefFixture(scenario ?? CHALLENGE_FIXTURE_SCENARIO) : null;
      if (useFixtures && !briefReader) return;
      const briefClient: AnthropicLike = useFixtures
        ? { createMessage: async () => briefReader!.next() as Anthropic.Message }
        : realClient!;
      await step.run("write-challenge-brief", () =>
        writeBriefForRun({
          thesisId,
          agentRunId,
          thesis: {
            title: t.title,
            ticker: t.ticker,
            positionDirection: t.positionDirection,
            timeHorizon: t.timeHorizon,
          },
          claims: t.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement })),
          client: briefClient,
        }),
      );
    }

    const evidence = await step.run("load-evidence", () => listEvidenceForRun(agentRunId));
    if (evidence.length === 0) {
      // settleBatch BEFORE the brief, on every exit: maybeWriteBrief can throw
      // (API error, missing fixture), and once retries are exhausted the whole
      // function fails — leaving completedRuns short of expectedRuns forever, so
      // that week's digest never sends. The digest never reads the brief, so a
      // batch settled first loses nothing; a batch settled second can be stranded.
      await settleBatch();
      await maybeWriteBrief(thesis);
      return { status: "no-evidence" as const };
    }

    const reader = useFixtures ? new EvaluationFixtureReader(scenario ?? "nvda-happy-path") : null;
    const client: AnthropicLike = useFixtures
      ? { createMessage: async () => reader!.next() as Anthropic.Message }
      : realClient!;

    const srcRows = await step.run("load-sources", () =>
      getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]),
    );
    const domainById = new Map(srcRows.map((s) => [s.id, s.domain]));

    // One step: caching makes retries cheap and idempotent (no nested steps).
    await step.run("evaluate-matrix", () =>
      evaluateMatrix({
        claims: thesis.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category })),
        evidence: evidence.map((e) => ({ id: e.id, extractedText: e.extractedText, sourceDomain: domainById.get(e.sourceId) })),
        client,
      }),
    );

    await step.run("recompute-health", () =>
      recomputeAndPersist({
        thesisId,
        agentRunId,
        claims: thesis.claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category })),
      }),
    );

    // Batch settling first (see the no-evidence exit above), then the brief:
    // challenge runs get one once every piece of evidence has a verdict, so the
    // challenger can only argue from what the evaluator actually scored.
    await settleBatch();
    await maybeWriteBrief(thesis);
    return { status: "evaluated" as const, pairs: thesis.claims.length * evidence.length };
  },
);
