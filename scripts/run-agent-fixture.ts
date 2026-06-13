/**
 * Offline end-to-end harness for the researcher engine.
 *
 * Runs the loop against a recorded fixture scenario (no Anthropic, no Brave, no
 * web) and persists a real agent_run + iterations + evidence to the dev DB,
 * bypassing Inngest. Proves the loop + fixtures + repositories work together.
 *
 * Run (needs Node 22, a thesis in the dev DB, + .env.local):
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/run-agent-fixture.ts [scenario]
 *
 * --conditions=react-server makes Node resolve the "server-only" no-op export
 * (the real package throws outside Next's server bundler).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { theses, claims as claimsTable } from "@/lib/db/schema";
import { createAgentRun, markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration, listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { findOrCreateSource } from "@/lib/db/repositories/sources";
import { createEvidence, listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import type { AnthropicLike } from "@/lib/ai/client";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import type { Anthropic } from "@anthropic-ai/sdk";

async function main() {
  const scenario = process.argv[2] ?? "nvda-happy-path";

  const [thesis] = await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");
  const cs = await db.select().from(claimsTable).where(eq(claimsTable.thesisId, thesis.id));

  const run = await createAgentRun(thesis.id, "manual");
  await markRunning(run.id);

  const reader = new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = {
    createMessage: async () => reader.nextMessage() as Anthropic.Message,
  };
  // Tool execution is replayed from the fixture (same mechanism as run-agent.ts).
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
    cs.map((c) => ({ statement: c.statement })),
    [],
    { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000, toolRunner },
    scenario,
  );

  await incrementRunTotals(run.id, {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    iterations: result.iterations,
    evidence: result.evidenceCount,
  });
  await finishRun(run.id, result.status === "failed" ? "failed" : result.status, { error: result.reason });

  const its = await listIterations(run.id);
  const ev = await listEvidenceForRun(run.id);
  console.log(
    JSON.stringify(
      { scenario, runId: run.id, status: result.status, iterations: its.length, evidence: ev.length },
      null,
      2,
    ),
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
