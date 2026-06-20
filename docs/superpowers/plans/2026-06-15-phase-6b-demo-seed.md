# Phase 6b — Demo Path + Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Try the demo" on the landing page opens a public, read-only, pre-seeded thesis dashboard and its agent-run trace — no sign-up.

**Architecture:** Public routes under `app/demo/` (outside the auth group) read a seeded demo thesis through a demo-scoped query module that guards every read to `DEMO_THESIS_ID`. A re-seedable script populates the demo via the offline fixtured pipeline (one real run → real trace + verdicts + claim health) plus backdated snapshots (for a chart trend). Read-only is structural: the visitor is unauthenticated and every mutation is auth+ownership-scoped, so there is nothing to mutate.

**Tech Stack:** Next.js 16 (Server Components), TypeScript (strict), Drizzle + Neon, Vitest (Node 22), the existing fixtured researcher/evaluator pipeline.

**Conventions (from CLAUDE.md):** Server Components by default; all *app* DB access through repositories (scripts may use `db` directly, as `run-agent-fixture.ts` does); no `any`; numeric/date conversions at boundaries; absolute `@/` imports; engage frontend-design per surface + design pass; `npm run typecheck` + `npm run lint` before every commit; tests need Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`); never commit PII (demo email is a generic configured address).

**Seed nuance (locked here):** the chart needs ≥2 snapshots and each `thesis_health_snapshots` row requires a unique `agent_run_id`. The seed creates **one real rich run** (with iterations/evidence → its trace is inspectable) plus **2 minimal backdated "historical" run rows** (no children) that exist only to anchor backdated snapshots. The demo run list shows only runs with `iterationsUsed > 0`, so the historical anchors power the chart trend without appearing as clickable empty traces.

**Approval workflow:** explicit human approval before every `git add`/`git commit`. Each task ends with a commit step — pause, summarize, show the diff, wait.

---

## File Structure

**Create:** `lib/demo/constants.ts`, `lib/demo/queries.ts` (+test), `scripts/seed-demo.ts`, `app/demo/page.tsx`, `app/demo/runs/[runId]/page.tsx`, `components/demo/DemoBanner.tsx`, `components/demo/DemoClaimList.tsx`.

**Modify:** `lib/db/repositories/theses.ts` (`getThesisWithClaimsById`), `lib/db/repositories/agent-runs.ts` (`getAgentRunById`), `lib/db/repositories/users.ts` (`listUserIdsWithActiveTheses` excludes the demo user), `app/page.tsx` (Try-the-demo CTA), `docs/DESIGN.md`.

---

## Task 1: Demo constants

**Files:** Create `lib/demo/constants.ts`.

- [ ] **Step 1: Implement** — `lib/demo/constants.ts`:
```ts
// Client-safe. The demo is a real users row + thesis seeded by scripts/seed-demo.ts.
// DEMO_USER_CLERK_ID is a sentinel — there is NO real Clerk account for it, so no
// one can authenticate as the demo user; the demo is public read-only.
export const DEMO_THESIS_ID = "00000000-0000-4000-8000-000000000d3a";
export const DEMO_USER_CLERK_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@thesistracker.app";
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/demo/constants.ts
git commit -m "feat: add demo constants (fixed thesis id, sentinel user)"
```

---

## Task 2: Unscoped repo reads + demo-scoped query module (TDD the guard)

**Files:** Modify `lib/db/repositories/theses.ts`, `lib/db/repositories/agent-runs.ts`; Create `lib/demo/queries.ts`, `lib/demo/queries.test.ts`.

- [ ] **Step 1: Narrow unscoped repo reads** — these are used ONLY via `lib/demo/queries.ts`.
  - In `lib/db/repositories/theses.ts` (it imports `eq`, `theses`, `claims`, `type ThesisWithClaims`):
    ```ts
    // Unscoped read — callers must enforce their own access control (see lib/demo).
    export async function getThesisWithClaimsById(thesisId: string): Promise<ThesisWithClaims | null> {
      const [thesisRows, claimRows] = await db.batch([
        db.select().from(theses).where(eq(theses.id, thesisId)).limit(1),
        db.select().from(claims).where(eq(claims.thesisId, thesisId)).orderBy(claims.ordinal),
      ]);
      const thesis = thesisRows[0];
      if (!thesis) return null;
      return { ...thesis, claims: claimRows };
    }
    ```
  - In `lib/db/repositories/agent-runs.ts` (imports `eq`, `desc`, `agentRuns`, `type AgentRun`):
    ```ts
    // Unscoped reads — callers must enforce their own access control (see lib/demo).
    export async function getAgentRunById(runId: string): Promise<AgentRun | null> {
      const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
      return row ?? null;
    }

    export async function listAgentRunsForThesisById(thesisId: string): Promise<AgentRun[]> {
      return db.select().from(agentRuns).where(eq(agentRuns.thesisId, thesisId)).orderBy(desc(agentRuns.createdAt));
    }
    ```
    (`desc` is already imported in `agent-runs.ts`; confirm.)

- [ ] **Step 2: Failing test for the scope guard** — `lib/demo/queries.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scopeToDemo } from "./queries";
import { DEMO_THESIS_ID } from "./constants";

describe("scopeToDemo", () => {
  it("returns the row when it belongs to the demo thesis", () => {
    const row = { id: "r1", thesisId: DEMO_THESIS_ID };
    expect(scopeToDemo(row)).toBe(row);
  });
  it("returns null for a row from a different thesis", () => {
    expect(scopeToDemo({ id: "r1", thesisId: "some-other-thesis" })).toBeNull();
  });
  it("returns null for null", () => {
    expect(scopeToDemo(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Verify fail** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run lib/demo/queries.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** — `lib/demo/queries.ts`:
```ts
import "server-only";
import { getThesisWithClaimsById } from "@/lib/db/repositories/theses";
import { getAgentRunById, listAgentRunsForThesisById } from "@/lib/db/repositories/agent-runs";
import { DEMO_THESIS_ID } from "./constants";

// Pure guard: only let demo-thesis rows through. Load-bearing — it stops
// /demo/runs/[anyId] from leaking another user's run by id.
export function scopeToDemo<T extends { thesisId: string }>(row: T | null): T | null {
  return row && row.thesisId === DEMO_THESIS_ID ? row : null;
}

export function getDemoThesis() {
  return getThesisWithClaimsById(DEMO_THESIS_ID);
}

export async function getDemoRun(runId: string) {
  return scopeToDemo(await getAgentRunById(runId));
}

export async function getDemoRuns() {
  const runs = await listAgentRunsForThesisById(DEMO_THESIS_ID);
  // Only runs that actually recorded work are inspectable; backdated snapshot
  // anchors (iterationsUsed === 0) power the chart but aren't listed.
  return runs.filter((r) => r.iterationsUsed > 0);
}
```

- [ ] **Step 5: Verify pass + typecheck/lint** — `npx vitest run lib/demo/queries.test.ts && npm run typecheck && npm run lint` → PASS / clean.

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/db/repositories/theses.ts lib/db/repositories/agent-runs.ts lib/demo/queries.ts lib/demo/queries.test.ts
git commit -m "feat: add demo-scoped read queries with thesis-id guard"
```

---

## Task 3: Exclude the demo user from scheduling

**Files:** Modify `lib/db/repositories/users.ts`.

- [ ] **Step 1: Filter out the demo user** — `listUserIdsWithActiveTheses` currently selects distinct `theses.userId` where status active. Exclude the demo user by clerk id. Replace its body with:
```ts
export async function listUserIdsWithActiveTheses(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: theses.userId })
    .from(theses)
    .innerJoin(users, eq(users.id, theses.userId))
    .where(and(eq(theses.status, "active"), ne(users.clerkUserId, DEMO_USER_CLERK_ID)));
  return rows.map((r) => r.userId);
}
```
Add `and`, `ne` to the `drizzle-orm` import; add `import { DEMO_USER_CLERK_ID } from "@/lib/demo/constants";`. (`users`, `theses`, `eq`, `db` already imported.)

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Commit** (after approval)
```bash
git add lib/db/repositories/users.ts
git commit -m "feat: exclude the demo user from weekly scheduling"
```

---

## Task 4: Seed script

**Files:** Create `scripts/seed-demo.ts`.

Mirrors `scripts/run-agent-fixture.ts` (same fixtured pipeline) but targets the fixed demo thesis and adds backdated snapshots. Re-seedable: deletes the demo thesis (cascade) first.

- [ ] **Step 1: Implement** — `scripts/seed-demo.ts`:
```ts
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
  // 1. Demo user (upsert; no email digests).
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: DEMO_USER_CLERK_ID, email: DEMO_USER_EMAIL, digestEnabled: false })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email: DEMO_USER_EMAIL, digestEnabled: false } })
    .returning();

  // 2. Re-seed clean: drop the demo thesis (cascades runs/evidence/links/snapshots), recreate at the fixed id.
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
  const cs = await db.select().from(claimsTable).where(eq(claimsTable.thesisId, DEMO_THESIS_ID));

  // 3. One real fixtured run → trace + evidence + verdicts + current health + snapshot.
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

  // 4. Backdated history → chart trend ending at the real current score. Each
  //    snapshot needs a unique agent_run_id, so anchor each to a minimal historical
  //    run (iterationsUsed = 0 → not listed by getDemoRuns).
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
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean.

- [ ] **Step 3: Run the seed (Node 22 + dev DB + .env.local)**
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
USE_AI_FIXTURES=1 node --conditions=react-server --env-file=.env.local --import tsx scripts/seed-demo.ts
```
Expected JSON: `evidence >= 1`, `currentOverall` a number in [-1,1], `backdatedSnapshots: 3`. (Re-running is idempotent — the demo thesis is dropped and recreated.)
> If the dev DB is unreachable, report the typecheck result and mark the live seed BLOCKED.

- [ ] **Step 4: Commit** (after approval)
```bash
git add scripts/seed-demo.ts
git commit -m "feat: add re-seedable demo seed script"
```

---

## Task 5: Demo banner + read-only claim list

**Files:** Create `components/demo/DemoBanner.tsx`, `components/demo/DemoClaimList.tsx`.

> **Engage the frontend-design skill** — the banner is calm utility chrome; the read-only claim list mirrors the real claim cards minus the edit affordances.

- [ ] **Step 1: Banner** — `components/demo/DemoBanner.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-sm text-zinc-600">
        You&apos;re viewing a <span className="font-medium text-zinc-800">live demo thesis</span> — read-only.
      </p>
      <Button asChild size="sm">
        <Link href="/sign-up">Sign up to track your own</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Read-only claim list** — `components/demo/DemoClaimList.tsx`:
```tsx
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { HealthBar } from "@/components/agent/HealthBar";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory } from "@/schemas/thesis";

export function DemoClaimList({ claims }: { claims: Claim[] }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Claims · {claims.length}</p>
      {claims.map((c, idx) => (
        <div key={c.id} className="border-b border-zinc-100 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-zinc-400">{idx + 1}</span>
              <CategoryBadge category={c.category as ClaimCategory} />
            </div>
            <HealthBar
              score={Number(c.currentHealthScore)}
              analyzed={c.currentHealthUpdatedAt !== null}
              trackClassName="w-20"
            />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** (after approval)
```bash
git add components/demo/DemoBanner.tsx components/demo/DemoClaimList.tsx
git commit -m "feat: add demo banner and read-only claim list"
```

---

## Task 6: Public demo dashboard

**Files:** Create `app/demo/page.tsx`.

Mirrors the thesis detail page's read-only parts (header, claims+health, chart, run list) using the demo-scoped queries. No `requireUserId`, no write controls.

> **Engage the frontend-design skill** — it should feel like the real dashboard, not a stripped page; the banner is the only "demo" tell.

- [ ] **Step 1: Implement** — `app/demo/page.tsx`:
```tsx
import Link from "next/link";
import { getDemoThesis, getDemoRuns } from "@/lib/demo/queries";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { DIRECTION_LABELS, HORIZON_LABELS } from "@/lib/theses/labels";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { thesisHealth } from "@/lib/health/score";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoClaimList } from "@/components/demo/DemoClaimList";
import { HealthBar } from "@/components/agent/HealthBar";
import { HealthChart } from "@/components/theses/HealthChart";

export default async function DemoPage() {
  const thesis = await getDemoThesis();
  if (!thesis) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
        The demo isn&apos;t available right now. <Link className="text-primary" href="/sign-up">Sign up</Link> to create your own thesis.
      </div>
    );
  }
  const runs = await getDemoRuns();
  const snapshots = await listSnapshotsForThesis(thesis.id);
  const chartPoints = snapshots.map((s) => ({ recordedAt: s.recordedAt.toISOString(), score: Number(s.overallScore) })).reverse();
  const analyzed = thesis.claims.some((c) => c.currentHealthUpdatedAt !== null);
  const thesisScore = thesisHealth(thesis.claims.map((c) => Number(c.currentHealthScore)));
  const lastAnalyzed = runs
    .filter((r) => isTerminalStatus(r.status) && r.completedAt)
    .reduce<Date | null>((acc, r) => { const c = r.completedAt as Date; return !acc || c > acc ? c : acc; }, null);
  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <DemoBanner />
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{thesis.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">{thesis.ticker}</span>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>{DIRECTION_LABELS[thesis.positionDirection]}</span>
        <span className="text-xs text-zinc-400">· {HORIZON_LABELS[thesis.timeHorizon]}</span>
        <span className="text-xs text-zinc-400">· {lastAnalyzed ? `Analyzed ${formatRelativeTime(lastAnalyzed)}` : "Not analyzed"}</span>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
        <div>
          <DemoClaimList claims={thesis.claims} />
          <div className="mt-10 border-t border-zinc-100 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Thesis health</p>
              <HealthBar score={thesisScore} analyzed={analyzed} trackClassName="w-28" />
            </div>
            <HealthChart points={chartPoints} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis runs</p>
          {runs.length === 0 && <p className="text-xs text-zinc-400">No runs yet.</p>}
          {runs.map((r) => (
            <Link key={r.id} href={`/demo/runs/${r.id}`} className="block rounded-lg border border-zinc-200 px-3 py-2.5 text-sm hover:bg-zinc-50">
              <span className="font-medium text-zinc-800">View agent run →</span>
              <span className="mt-0.5 block font-mono text-[11px] text-zinc-400">
                {r.iterationsUsed} iters · {r.evidenceCollected} evidence{r.completedAt ? ` · ${formatRelativeTime(r.completedAt)}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Manual check** — `npm run dev`, open `/demo` (no sign-in): banner, claims with health bars, the chart with a downward trend, and a run link. No write controls.
- [ ] **Step 4: Commit** (after approval)
```bash
git add app/demo/page.tsx
git commit -m "feat: add public read-only demo dashboard"
```

---

## Task 7: Public demo trace

**Files:** Create `app/demo/runs/[runId]/page.tsx`.

Mirrors the authenticated trace page but public + demo-scoped, reusing `RunHeader`/`IterationCard` and the verdict mapping.

- [ ] **Step 1: Implement** — `app/demo/runs/[runId]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoThesis, getDemoRun } from "@/lib/demo/queries";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { listLinksForEvidenceIds } from "@/lib/db/repositories/claim-evidence-links";
import { buildEvidenceVerdicts, type EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";

export default async function DemoTracePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const [thesis, run] = await Promise.all([getDemoThesis(), getDemoRun(runId)]);
  if (!thesis || !run) notFound();

  const [iterations, evidence] = await Promise.all([listIterations(run.id), listEvidenceForRun(run.id)]);
  const srcRows = await getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]);
  const sourcesById = new Map(srcRows.map((s) => [s.id, s]));
  const links = await listLinksForEvidenceIds(evidence.map((e) => e.id));
  const linksByEvidenceId = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByEvidenceId.get(l.evidenceId) ?? [];
    arr.push(l);
    linksByEvidenceId.set(l.evidenceId, arr);
  }
  const verdictsByEvidenceId = new Map<string, EvidenceVerdict[]>(
    evidence.map((e) => [e.id, buildEvidenceVerdicts(e.claimIndices, thesis.claims, linksByEvidenceId.get(e.id) ?? [])]),
  );
  const lastIterId = iterations.at(-1)?.id;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <DemoBanner />
      <Link href="/demo" className="text-xs text-zinc-400 hover:text-zinc-600">← Back to the demo thesis</Link>
      <RunHeader run={run} ticker={thesis.ticker} />
      <div className="relative mt-6 pl-[30px]">
        <span className="absolute bottom-4 left-[9px] top-1.5 w-0.5 bg-zinc-200" aria-hidden />
        {iterations.map((it, idx) => (
          <IterationCard
            key={it.id}
            iteration={it}
            index={idx}
            active={!isTerminalStatus(run.status) && idx === iterations.length - 1}
            evidence={it.id === lastIterId ? evidence : []}
            sourcesById={sourcesById}
            verdictsByEvidenceId={verdictsByEvidenceId}
          />
        ))}
        {iterations.length === 0 && <p className="text-sm text-zinc-400">No iterations recorded.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Manual check** — from `/demo`, click the run → the trace renders (reasoning, tool calls, evidence + verdicts). Visiting `/demo/runs/<a-non-demo-run-id>` → 404 (the scope guard).
- [ ] **Step 4: Commit** (after approval)
```bash
git add app/demo/runs/\[runId\]/page.tsx
git commit -m "feat: add public read-only demo agent-run trace"
```

---

## Task 8: "Try the demo" landing CTA

**Files:** Modify `app/page.tsx`.

> **Engage the frontend-design skill** — a secondary CTA beside the existing primary; don't redesign the hero (that's 6c).

- [ ] **Step 1: Add the CTA** — in `app/page.tsx`, locate the hero's primary CTA (a `<Button asChild>` wrapping a `<Link href="/sign-up">`). Add a secondary "Try the demo" link next to it, e.g.:
```tsx
            <Button asChild variant="outline">
              <Link href="/demo">Try the demo</Link>
            </Button>
```
Place it adjacent to the existing sign-up CTA in the hero (wrap both in a `flex items-center gap-3` container if not already). Do not remove or restyle the existing CTAs.

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint` → clean.
- [ ] **Step 3: Manual check** — landing page shows "Try the demo" → `/demo`.
- [ ] **Step 4: Commit** (after approval)
```bash
git add app/page.tsx
git commit -m "feat: add Try the demo CTA to the landing page"
```

---

## Task 9: Gates + design pass + DESIGN.md

**Files:** Modify any 6b surface as the pass dictates; `docs/DESIGN.md`.

- [ ] **Step 1: Full gates** — `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run && npm run typecheck && npm run lint` → all pass / clean.
- [ ] **Step 2: Design pass** — re-engage frontend-design on `/demo`, `/demo/runs/[runId]`, the banner, and the landing CTA. The demo dashboard should read as the real product; tighten only what clearly needs it.
- [ ] **Step 3: Record in `docs/DESIGN.md`** — append a "Demo path (Phase 6b)" screen-notes block: public read-only `/demo` routes outside the auth group; the demo banner + "Sign up to track your own" CTA; the read-only claim list (same cards, no edit affordances); read-only by construction (unauthenticated + ownership-scoped mutations); the seeded chart trend (real run/verdicts, backdated snapshots). Dated decisions-log entries (2026-06-15): (a) demo = public read-only routes + a sentinel demo user (no Clerk account), not a shared signed-in account; (b) re-seedable via the fixtured pipeline.
- [ ] **Step 4: Commit** (after approval)
```bash
git add docs/DESIGN.md <any-touched-files>
git commit -m "docs: record Phase 6b demo-path design decisions"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Demo constants (fixed thesis id, sentinel user, generic email) → Task 1. ✓
- Demo-scoped queries + `scopeToDemo` guard (no cross-user run leakage) → Task 2 (TDD). ✓
- Demo excluded from scheduling → Task 3. ✓
- Re-seedable seed (fixtured run + backdated snapshots for the trend; digest_enabled false) → Task 4. ✓
- Public read-only dashboard + trace → Tasks 6–7. ✓
- Banner + read-only claim list → Task 5. ✓
- Landing CTA → Task 8. ✓
- Read-only by construction; unseeded/notFound empty states → Tasks 2, 6, 7. ✓
- Design pass + DESIGN.md → Task 9. ✓
- Out of scope (landing visual polish 6c, README/OG/video 6e) correctly excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete, final code. The seed nuance (backdated snapshots anchored to `iterationsUsed === 0` runs, filtered out of the listed runs) is fully specified.

**Type consistency:** `scopeToDemo<T extends { thesisId: string }>` (Task 2) used by `getDemoRun`. `getThesisWithClaimsById`→`ThesisWithClaims`, `getAgentRunById`/`listAgentRunsForThesisById`→`AgentRun[]` (Task 2) consumed by the demo pages (6–7). `DEMO_THESIS_ID`/`DEMO_USER_CLERK_ID`/`DEMO_USER_EMAIL` (Task 1) used in Tasks 2–4. `getDemoRuns` filters `iterationsUsed > 0`, matching the seed's iterationsUsed=0 anchors (Task 4). Demo pages reuse existing read-only components (`HealthBar`, `HealthChart`, `RunHeader`, `IterationCard`, `buildEvidenceVerdicts`, `formatRelativeTime`, `thesisHealth`) with signatures matching their Phase 3/4/5 definitions. Numeric `overallScore`/`currentHealthScore` converted with `Number()`.
```
