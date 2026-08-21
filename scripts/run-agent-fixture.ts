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
 *
 * --- Recording a fixture from the live API (real cost) ---
 *
 * The two runs above are both OFFLINE — they replay `__fixtures__/agent-runs/`
 * and never call Anthropic. To actually record a scenario, pass --live and
 * --thesis, and do NOT set USE_AI_FIXTURES (the script refuses to start if
 * it's set):
 *
 *   node --conditions=react-server --env-file=.env.local --import tsx \
 *     scripts/run-agent-fixture.ts nvda-challenge challenge \
 *     --live --thesis <demo-thesis-id>
 *
 * --thesis is not optional for a re-recording: the researcher's claim_indices
 * and the brief's claim_index are positional into that thesis's
 * ordinal-ordered claim list. Recording against a thesis with a different
 * claim set silently maps arguments onto the wrong claims — the indices stay
 * in range, so nothing errors.
 *
 * --live prompts for typed confirmation ("record") before spending money, and
 * only overwrites the fixture files whose sink was actually non-empty this
 * run — see writeScenarioFixtures in lib/ai/fixture-capture.ts.
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
import { listLinksForClaim } from "@/lib/db/repositories/claim-evidence-links";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { EvaluationFixtureReader } from "@/lib/ai/evaluation-fixtures";
import { evaluateMatrix, recomputeAndPersist } from "@/lib/ai/evaluate-pipeline";
import { selectChangedTheses } from "@/lib/digest/select";
import { summarize } from "@/lib/ai/agents/summarizer";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { ChallengeBriefFixtureReader } from "@/lib/ai/challenge-brief-fixtures";
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { writeBriefForRun } from "@/lib/ai/challenge-pipeline";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
import { createInterface } from "node:readline/promises";
import { serverEnv } from "@/lib/env.server";
import { createAnthropicClient } from "@/lib/ai/client";
import { buildToolContext } from "@/lib/ai/tool-context";
import {
  parseHarnessArgs,
  tapClient,
  toolResultsFromIterations,
  writeScenarioFixtures,
} from "@/lib/ai/fixture-capture";
import { join } from "node:path";

async function main() {
  const args = parseHarnessArgs(process.argv.slice(2));
  const { scenario, mode, live } = args;

  // --live spends real money. Refuse the incoherent combination outright rather
  // than silently ignoring one half of it.
  if (live && serverEnv.USE_AI_FIXTURES) {
    throw new Error("--live cannot run with USE_AI_FIXTURES=1. Unset it and re-run.");
  }

  const [thesis] = args.thesisId
    ? await db.select().from(theses).where(eq(theses.id, args.thesisId)).limit(1)
    : await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");

  if (live) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\nLIVE RUN — this calls the Anthropic API and spends real money.`);
    console.log(`  thesis:   ${thesis.ticker} — ${thesis.title} (${thesis.id})`);
    console.log(`  scenario: ${scenario}  mode: ${mode}`);
    console.log(`  writes:   __fixtures__/agent-runs/${scenario}/ (5 files, overwritten)\n`);
    const answer = await rl.question(`Type "record" to continue: `);
    rl.close();
    if (answer.trim() !== "record") throw new Error("Aborted.");
  }

  const cs = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.thesisId, thesis.id))
    .orderBy(claimsTable.ordinal);

  const run = await createAgentRun(thesis.id, "manual", { mode });
  await markRunning(run.id);

  const captured = {
    messages: [] as unknown[],
    evaluations: [] as unknown[],
    challengeBrief: [] as unknown[],
    digest: [] as unknown[],
  };

  const reader = live ? null : new FixtureReader(FIXTURE_ROOT, scenario);
  const client: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.messages)
    : { createMessage: async () => reader!.nextMessage() as Anthropic.Message };

  // Offline: tool execution is replayed from the fixture (same mechanism as
  // run-agent.ts). Live: undefined, so the loop runs the real tools and we
  // recover their outputs from the persisted iterations afterwards.
  const toolRunner = live
    ? undefined
    : async (): Promise<ToolResult> => ({ ok: true, output: reader!.nextToolResult() });
  const toolContext: ToolContext = live
    ? buildToolContext(scenario)
    : {
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
  const evalReader = live ? null : new EvaluationFixtureReader(scenario);
  const evalClient: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.evaluations)
    : { createMessage: async () => evalReader!.next() as Anthropic.Message };
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
  const digestClient: AnthropicLike = live
    ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.digest)
    : { createMessage: async () => new DigestFixtureReader(scenario).next() as Anthropic.Message };
  const digest = changed.length ? await summarize(changed, { client: digestClient }) : { theses: [] };

  // --- Challenge brief (offline, fixture-backed; only for mode="challenge") ---
  let brief: { headline: string; pointCount: number } | null = null;
  if (mode === "challenge") {
    const briefReader = live ? null : new ChallengeBriefFixtureReader(scenario);
    const briefClient: AnthropicLike = live
      ? tapClient(createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!), captured.challengeBrief)
      : { createMessage: async () => briefReader!.next() as Anthropic.Message };
    const briefClaims = cs.map((c) => ({ id: c.id, ordinal: c.ordinal, statement: c.statement }));
    const { written, reason } = await writeBriefForRun({
      thesisId: thesis.id,
      agentRunId: run.id,
      thesis: {
        title: thesis.title,
        ticker: thesis.ticker,
        positionDirection: thesis.positionDirection,
        timeHorizon: thesis.timeHorizon,
      },
      claims: briefClaims,
      client: briefClient,
    });
    if (written) {
      const stored = await getBriefForRun(run.id);
      if (!stored) throw new Error("Expected a challenge_briefs row after writeBriefForRun, found none.");
      const points = stored.points as ChallengeBriefPoint[];
      brief = { headline: stored.headline, pointCount: points.length };
      console.log(`Challenge brief: "${stored.headline}" (${points.length} points)`);
    } else {
      console.log(`Challenge brief not written: ${reason}`);
    }
  }

  if (live) {
    const dir = join(FIXTURE_ROOT, scenario);
    const { written, skipped } = writeScenarioFixtures(dir, {
      messages: captured.messages,
      tools: toolResultsFromIterations(its),
      evaluations: captured.evaluations,
      challengeBrief: captured.challengeBrief,
      digest: captured.digest,
    });
    console.log(`Wrote to ${dir}: ${written.length ? written.join(", ") : "(nothing)"}`);
    if (skipped.length > 0) {
      console.log(
        `Skipped (sink was empty this run — existing committed file left untouched): ${skipped.join(", ")}`,
      );
    }
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
