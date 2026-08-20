/**
 * Re-seedable demo data. Run (Node 22 + .env.local):
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/seed-demo.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, theses, claims as claimsTable, agentRuns, thesisHealthSnapshots } from "@/lib/db/schema";
import { markRunning, finishRun, incrementRunTotals, createAgentRun } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { findOrCreateSource } from "@/lib/db/repositories/sources";
import { createEvidence, listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import type { AnthropicLike } from "@/lib/ai/client";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import type { Anthropic } from "@anthropic-ai/sdk";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { DEMO_THESIS_ID, DEMO_USER_CLERK_ID, DEMO_USER_EMAIL } from "@/lib/demo/constants";

const SCENARIO = "nvda-happy-path";
const DEMO_CLAIMS = [
  { ordinal: 0, statement: "Data-center revenue keeps growing at a high rate year over year", category: "financial_performance" as const },
  { ordinal: 1, statement: "NVIDIA keeps its lead over competing AI accelerators", category: "competitive_position" as const },
  { ordinal: 2, statement: "Hyperscaler AI capex stays elevated through the period", category: "macro_environment" as const },
];

async function main() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: DEMO_USER_CLERK_ID, email: DEMO_USER_EMAIL, digestEnabled: false })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email: DEMO_USER_EMAIL, digestEnabled: false } })
    .returning();

  // Re-seed clean: drop the demo thesis (cascades runs/evidence/links/snapshots), recreate at the fixed id.
  await db.delete(theses).where(eq(theses.id, DEMO_THESIS_ID));
  await db.insert(theses).values({
    id: DEMO_THESIS_ID,
    userId: user.id,
    title: "Long NVDA — durable AI data-center demand",
    ticker: "NVDA",
    positionDirection: "long",
    timeHorizon: "6_to_12_months",
    status: "active",
    notes: null,
  });
  await db.insert(claimsTable).values(DEMO_CLAIMS.map((c) => ({ thesisId: DEMO_THESIS_ID, ...c })));
  // Positional claim indices (researcher claim_indices, brief claim_index) are
  // resolved against this order — it must be the ordinal order, not whatever
  // Postgres returns.
  const cs = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.thesisId, DEMO_THESIS_ID))
    .orderBy(claimsTable.ordinal);

  // One real fixtured run → trace + evidence + verdicts + current health + snapshot.
  const run = await createAgentRun(DEMO_THESIS_ID, "scheduled");
  await markRunning(run.id);
  const reader = new FixtureReader(FIXTURE_ROOT, SCENARIO);
  const client: AnthropicLike = { createMessage: async () => reader.nextMessage() as Anthropic.Message };
  const toolRunner = async (): Promise<ToolResult> => ({ ok: true, output: reader.nextToolResult() });
  const toolContext: ToolContext = { search: { search: async () => [] }, fetcher: async () => ({ status: 200, html: "", finalUrl: "" }), edgarClient: async () => [], useFixtures: true, scenario: SCENARIO };
  const persist: ResearcherPersist = {
    appendIteration: (it) => appendIteration({ agentRunId: run.id, ...it }),
    persistEvidence: async (item) => {
      const source = await findOrCreateSource({ url: item.source_url, domain: hostnameOf(item.source_url), title: item.title, rawContentHash: sha256(item.extracted_text), contentExcerpt: item.snippet });
      await createEvidence({ agentRunId: run.id, sourceId: source.id, extractedText: item.extracted_text, claimIndices: item.claim_indices, agentReasoning: null });
    },
  };
  const result = await runResearcher(
    { title: "Long NVDA — durable AI data-center demand", ticker: "NVDA", positionDirection: "long", timeHorizon: "6_to_12_months" },
    cs.map((c) => ({ statement: c.statement })),
    [],
    { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000, toolRunner },
    SCENARIO,
  );
  await incrementRunTotals(run.id, { inputTokens: result.inputTokens, outputTokens: result.outputTokens, iterations: result.iterations, evidence: result.evidenceCount });
  await finishRun(run.id, result.status === "failed" ? "failed" : result.status, { error: result.reason });

  const ev = await listEvidenceForRun(run.id);
  const pipelineClaims = cs.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category }));
  const evalReader = new EvaluationFixtureReader(SCENARIO);
  const evalClient: AnthropicLike = { createMessage: async () => evalReader.next() as Anthropic.Message };
  await evaluateMatrix({ claims: pipelineClaims, evidence: ev.map((e) => ({ id: e.id, extractedText: e.extractedText })), client: evalClient });
  const { overallScore } = await recomputeAndPersist({ thesisId: DEMO_THESIS_ID, agentRunId: run.id, claims: pipelineClaims });

  // Backdated history → chart trend. Each snapshot needs a unique agent_run_id, so
  // anchor each to a minimal historical run (iterationsUsed = 0 → not listed by getDemoRuns).
  const day = 86_400_000;
  const trajectory = [
    { daysAgo: 21, score: 0.55 },
    { daysAgo: 14, score: 0.4 },
    { daysAgo: 7, score: 0.2 },
  ];
  for (const point of trajectory) {
    const recordedAt = new Date(Date.now() - point.daysAgo * day);
    const [anchor] = await db
      .insert(agentRuns)
      .values({ thesisId: DEMO_THESIS_ID, trigger: "scheduled", status: "complete", startedAt: recordedAt, completedAt: recordedAt, iterationsUsed: 0, inputTokens: 0, outputTokens: 0, evidenceCollected: 0 })
      .returning();
    await db.insert(thesisHealthSnapshots).values({
      thesisId: DEMO_THESIS_ID,
      agentRunId: anchor.id,
      recordedAt,
      overallScore: String(point.score),
      claimScores: pipelineClaims.map((c) => ({ claimId: c.id, ordinal: c.ordinal, score: point.score })),
    });
  }

  console.log(JSON.stringify({ thesisId: DEMO_THESIS_ID, realRun: run.id, evidence: ev.length, currentOverall: overallScore, backdatedSnapshots: trajectory.length, demoUrl: "/demo" }, null, 2));
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
