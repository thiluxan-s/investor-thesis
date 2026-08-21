/**
 * Re-seedable demo data. Run (Node 22 + .env.local):
 *   USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/seed-demo.ts
 *
 * Seeds two fixtured runs: a research run and a challenge run with its brief.
 * Both replay __fixtures__/agent-runs/ and cost nothing.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, theses, claims as claimsTable, agentRuns, thesisHealthSnapshots } from "@/lib/db/schema";
import { seedFixturedRun } from "@/lib/demo/seed-run";
import { RESEARCH_SCENARIO, CHALLENGE_SCENARIO } from "@/lib/agent/scenario";
import { DEMO_THESIS_ID, DEMO_USER_CLERK_ID, DEMO_USER_EMAIL } from "@/lib/demo/constants";

const DEMO_THESIS = {
  title: "Long NVDA — durable AI data-center demand",
  ticker: "NVDA",
  positionDirection: "long" as const,
  timeHorizon: "6_to_12_months" as const,
};
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
    ...DEMO_THESIS,
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
  const pipelineClaims = cs.map((c) => ({
    id: c.id,
    ordinal: c.ordinal,
    statement: c.statement,
    category: c.category,
  }));
  const seedThesis = { id: DEMO_THESIS_ID, ...DEMO_THESIS };

  // Two fixtured runs. ORDER IS LOAD-BEARING for two independent reasons:
  // (1) writeBriefForRun returns no_weakening_evidence without calling the
  // model unless the thesis already holds standing `weakens` links, and the
  // research run is what supplies them; (2) the brief's evidence_indices are
  // positional into selectBriefEvidence's ranked output, so which run's
  // evidence lands at which index depends on this order too — reversing the
  // two runs would silently re-point the challenger's citations at different
  // sources, with nothing erroring because the indices stay in range.
  //
  // recordedAt backdates this run's health snapshot by 3 days so its chart
  // point gets its own date tick, distinct from the challenge run below
  // (which records at "now"): HealthChart labels ticks with toLocaleDateString,
  // so two snapshots seconds apart would otherwise render as two identically-
  // labelled ticks with a vertical step between them.
  const research = await seedFixturedRun({
    thesis: seedThesis,
    claims: pipelineClaims,
    scenario: RESEARCH_SCENARIO,
    mode: "research",
    trigger: "scheduled",
    recordedAt: new Date(Date.now() - 3 * 86_400_000),
  });
  const challenge = await seedFixturedRun({
    thesis: seedThesis,
    claims: pipelineClaims,
    scenario: CHALLENGE_SCENARIO,
    mode: "challenge",
    trigger: "manual",
  });
  if (!challenge.briefWritten) {
    console.warn(
      `WARNING: no challenge brief was written (${challenge.briefReason}). ` +
        `/demo will show the challenge run but no case-against card.`,
    );
  }

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

  console.log(
    JSON.stringify(
      {
        thesisId: DEMO_THESIS_ID,
        researchRun: research.runId,
        challengeRun: challenge.runId,
        evidence: research.evidenceCount + challenge.evidenceCount,
        briefWritten: challenge.briefWritten,
        currentOverall: challenge.overallScore,
        backdatedSnapshots: trajectory.length,
        demoUrl: "/demo",
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
