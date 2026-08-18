/**
 * Offline end-to-end harness for the researcher engine.
 *
 * Runs the loop against a recorded fixture scenario (no Anthropic, no Brave, no
 * web) and persists a real agent_run + iterations + evidence to the dev DB,
 * bypassing Inngest. Proves the loop + fixtures + repositories work together.
 *
 * Run (needs Node 22, a thesis in the dev DB, + .env.local):
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/run-agent-fixture.ts [scenario] [mode]
 *
 * Challenge mode also writes a challenge brief:
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/run-agent-fixture.ts nvda-challenge challenge
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
import { listLinksForClaim, listWeakeningLinksForThesis } from "@/lib/db/repositories/claim-evidence-links";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { selectChangedTheses } from "@/lib/digest/select";
import { summarize } from "@/lib/ai/agents/summarizer";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { writeChallengeBrief, type BriefEvidenceItem } from "@/lib/ai/agents/challenger";
import { selectBriefEvidence } from "@/lib/challenge/select";
import { upsertBrief, getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { CHALLENGER_PROMPT_VERSION } from "@/lib/ai/prompts/challenger";
import type { AgentRunMode } from "@/schemas/agent";

// Selects weakening evidence for the thesis, runs the challenger, and persists
// a challenge_briefs row. Mirrors what the (not-yet-wired) Inngest step does,
// but sourced from a fixture-backed client so it costs nothing offline.
async function writeBriefForRun(
  thesisId: string,
  agentRunId: string,
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { id: string; ordinal: number; statement: string }[],
  client: AnthropicLike,
): Promise<{ headline: string; pointCount: number } | null> {
  const links = await listWeakeningLinksForThesis(thesisId);
  const selected = selectBriefEvidence(links, new Date());
  const items: BriefEvidenceItem[] = selected.map((s) => ({
    evidenceId: s.evidenceId,
    claimId: s.claimId,
    claimOrdinal: s.claimOrdinal,
    extractedText: s.extractedText,
    sourceDomain: s.sourceDomain,
    confidence: s.confidence,
    ageDays: s.ageDays,
  }));
  const result = await writeChallengeBrief(thesis, claims, items, { client });
  if (!result) return null;
  await upsertBrief({
    agentRunId,
    thesisId,
    headline: result.headline,
    summary: result.summary,
    points: result.points,
    promptVersion: CHALLENGER_PROMPT_VERSION,
  });
  return { headline: result.headline, pointCount: result.points.length };
}

async function main() {
  const scenario = process.argv[2] ?? "nvda-happy-path";
  const mode = (process.argv[3] as AgentRunMode) ?? "research";

  const [thesis] = await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");
  const cs = await db.select().from(claimsTable).where(eq(claimsTable.thesisId, thesis.id));

  const run = await createAgentRun(thesis.id, "manual", { mode });
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
    mode,
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

  // --- Evaluation pipeline (offline, fixture-backed) ---
  const evalReader = new EvaluationFixtureReader(scenario);
  const evalClient: AnthropicLike = {
    createMessage: async () => evalReader.next() as Anthropic.Message,
  };
  const pipelineClaims = cs.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement, category: c.category }));
  const pairs = await evaluateMatrix({
    claims: pipelineClaims,
    evidence: ev.map((e) => ({ id: e.id, extractedText: e.extractedText })),
    client: evalClient,
  });
  const { overallScore } = await recomputeAndPersist({ thesisId: thesis.id, agentRunId: run.id, claims: pipelineClaims });
  const linkCounts = await Promise.all(pipelineClaims.map((c) => listLinksForClaim(c.id).then((l) => l.length)));
  const snapshots = await listSnapshotsForThesis(thesis.id);

  // --- Digest pipeline (offline, fixture-backed) ---
  const srcRows = await getSourcesByIds([...new Set(ev.map((e) => e.sourceId))]);
  const domainById = new Map(srcRows.map((s) => [s.id, s.domain]));
  const changed = selectChangedTheses({
    theses: [{ id: thesis.id, title: thesis.title, ticker: thesis.ticker, positionDirection: thesis.positionDirection }],
    evidenceByThesis: new Map([
      [thesis.id, ev.map((e) => ({ sourceDomain: domainById.get(e.sourceId) ?? "source", extractedText: e.extractedText }))],
    ]),
    snapshotsByThesis: new Map([[thesis.id, snapshots.map((s) => ({ overallScore: Number(s.overallScore) }))]]),
  });
  const digestClient: AnthropicLike = { createMessage: async () => new DigestFixtureReader(scenario).next() as Anthropic.Message };
  const digest = changed.length ? await summarize(changed, { client: digestClient }) : { theses: [] };

  // --- Challenge brief (offline, fixture-backed; only for mode="challenge") ---
  let brief: { headline: string; pointCount: number } | null = null;
  if (mode === "challenge") {
    const briefReader = new ChallengeBriefFixtureReader(scenario);
    const briefClient: AnthropicLike = {
      createMessage: async () => briefReader.next() as Anthropic.Message,
    };
    const briefClaims = cs.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement }));
    brief = await writeBriefForRun(
      thesis.id,
      run.id,
      { title: thesis.title, ticker: thesis.ticker, positionDirection: thesis.positionDirection, timeHorizon: thesis.timeHorizon },
      briefClaims,
      briefClient,
    );
    const stored = await getBriefForRun(run.id);
    if (!stored) throw new Error("Expected a challenge_briefs row after writeBriefForRun, found none.");
    console.log(`Challenge brief: "${stored.headline}" (${brief?.pointCount ?? 0} points)`);
  }

  console.log(
    JSON.stringify(
      { scenario, mode, runId: run.id, status: result.status, iterations: its.length, evidence: ev.length,
        pairsEvaluated: pairs, linksPerClaim: linkCounts, overallScore, snapshots: snapshots.length,
        digestThesesChanged: changed.length, digestBlurbs: digest.theses.length,
        brief: brief ? { headline: brief.headline, pointCount: brief.pointCount } : null },
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
