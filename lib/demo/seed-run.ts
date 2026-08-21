import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { createAgentRun, markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { findOrCreateSource } from "@/lib/db/repositories/sources";
import { createEvidence, listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import type { AnthropicLike } from "@/lib/ai/client";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { evaluateMatrix, recomputeAndPersist, type PipelineClaim } from "@/lib/ai/evaluate-pipeline";
import { writeBriefForRun } from "@/lib/ai/challenge-pipeline";
import type { AgentRunMode, AgentRunTrigger } from "@/schemas/agent";
import type { PositionDirection } from "@/schemas/thesis";

export type SeedThesis = {
  id: string;
  title: string;
  ticker: string;
  positionDirection: PositionDirection;
  timeHorizon: string;
};

export type SeededRun = {
  runId: string;
  evidenceCount: number;
  overallScore: number;
  briefWritten: boolean;
  briefReason?: string;
};

// Replay one recorded scenario end to end: researcher loop -> evidence ->
// evaluator -> health recompute, plus the challenge brief in challenge mode.
//
// Extracted from scripts/seed-demo.ts when the demo seed grew a second run —
// inlining this wiring twice would guarantee the two copies drift.
//
// OFFLINE ONLY. Every model client here reads from __fixtures__ and never calls
// Anthropic, so callers must run under USE_AI_FIXTURES=1.
export async function seedFixturedRun(opts: {
  thesis: SeedThesis;
  claims: PipelineClaim[];
  scenario: string;
  mode: AgentRunMode;
  trigger: AgentRunTrigger;
  // Forwarded to recomputeAndPersist's `now` — the instant the health snapshot
  // is recorded at. Defaults to the actual current time. Callers seeding
  // multiple runs close together (e.g. scripts/seed-demo.ts) can spread this
  // out so the chart doesn't render two identically-labelled date ticks.
  recordedAt?: Date;
}): Promise<SeededRun> {
  const { thesis, claims, scenario, mode, trigger, recordedAt } = opts;

  const run = await createAgentRun(thesis.id, trigger, { mode });
  await markRunning(run.id);

  const reader = new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = {
    createMessage: async () => reader.nextMessage() as Anthropic.Message,
  };
  const toolRunner = async (): Promise<ToolResult> => ({ ok: true, output: reader.nextToolResult() });
  const toolContext: ToolContext = {
    search: { search: async () => [] },
    fetcher: async () => ({ status: 200, html: "", finalUrl: "" }),
    edgarClient: async () => [],
    useFixtures: true,
    scenario,
  };
  const persist: ResearcherPersist = {
    appendIteration: (it) => appendIteration({ agentRunId: run.id, ...it }),
    persistEvidence: async (item) => {
      const source = await findOrCreateSource({
        url: item.source_url,
        domain: hostnameOf(item.source_url),
        title: item.title,
        rawContentHash: sha256(item.extracted_text),
        contentExcerpt: item.snippet,
      });
      await createEvidence({
        agentRunId: run.id,
        sourceId: source.id,
        extractedText: item.extracted_text,
        claimIndices: item.claim_indices,
        agentReasoning: null,
      });
    },
  };

  const result = await runResearcher(
    {
      title: thesis.title,
      ticker: thesis.ticker,
      positionDirection: thesis.positionDirection,
      timeHorizon: thesis.timeHorizon,
    },
    claims.map((c) => ({ statement: c.statement })),
    [],
    { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000, toolRunner },
    scenario,
    mode,
  );
  await incrementRunTotals(run.id, {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    iterations: result.iterations,
    evidence: result.evidenceCount,
  });
  await finishRun(run.id, result.status === "failed" ? "failed" : result.status, {
    error: result.reason,
  });

  const ev = await listEvidenceForRun(run.id);
  const evalReader = new EvaluationFixtureReader(scenario);
  const evalClient: AnthropicLike = {
    createMessage: async () => evalReader.next() as Anthropic.Message,
  };
  await evaluateMatrix({
    claims,
    evidence: ev.map((e) => ({ id: e.id, extractedText: e.extractedText })),
    client: evalClient,
  });
  const { overallScore } = await recomputeAndPersist({
    thesisId: thesis.id,
    agentRunId: run.id,
    claims,
    now: recordedAt,
  });

  let briefWritten = false;
  let briefReason: string | undefined;
  if (mode === "challenge") {
    const briefReader = new ChallengeBriefFixtureReader(scenario);
    const briefClient: AnthropicLike = {
      createMessage: async () => briefReader.next() as Anthropic.Message,
    };
    const out = await writeBriefForRun({
      thesisId: thesis.id,
      agentRunId: run.id,
      thesis: {
        title: thesis.title,
        ticker: thesis.ticker,
        positionDirection: thesis.positionDirection,
        timeHorizon: thesis.timeHorizon,
      },
      claims: claims.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement })),
      client: briefClient,
    });
    briefWritten = out.written;
    briefReason = out.reason;
  }

  return { runId: run.id, evidenceCount: ev.length, overallScore, briefWritten, briefReason };
}
