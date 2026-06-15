import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { inngest, type AgentRunCompleted } from "@/lib/inngest/client";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { recordBatchProgress } from "@/lib/db/repositories/digest-batches";
import { serverEnv } from "@/lib/env.server";

export const evaluateRun = inngest.createFunction(
  { id: "evaluate-run", retries: 2, triggers: [{ event: "agent-run.completed" }] },
  async ({ event, step }) => {
    const { agentRunId, thesisId, userId, scenario, batchId } = event.data as AgentRunCompleted["data"];

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
    const evidence = await step.run("load-evidence", () => listEvidenceForRun(agentRunId));
    if (evidence.length === 0) {
      await settleBatch();
      return { status: "no-evidence" as const };
    }

    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const reader = useFixtures ? new EvaluationFixtureReader(scenario ?? "nvda-happy-path") : null;
    const client: AnthropicLike = useFixtures
      ? { createMessage: async () => reader!.next() as Anthropic.Message }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);

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

    await settleBatch();
    return { status: "evaluated" as const, pairs: thesis.claims.length * evidence.length };
  },
);
