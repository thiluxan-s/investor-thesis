# Phase 3b — Agent Run UI & Trace View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user clicks "Analyze now", watches the run progress live (status, growing evidence, cost) in the detail-page rail, and opens a full-width **trace view** that renders the agent's reasoning, tool calls, results, and inline evidence as an immersive timeline.

**Architecture:** The detail page (Server Component) reads the thesis's runs and renders a client `AgentRunPanel` in the rail; while a run is non-terminal a small wrapper calls `router.refresh()` every ~3s to re-read. "Analyze now" calls the existing `triggerAgentRun`. The trace lives at the sub-route `/theses/[thesisId]/runs/[runId]` (Server Component reading run + iterations + evidence), rendered as a single-column timeline with Motion reveal animations. No new agent logic — this reads what the Phase 3a engine produced.

**Tech Stack:** Next.js 16 App Router, React 19 (`useTransition`, `router.refresh`), TS strict, Drizzle (neon-http), `motion` (framer-motion successor — `motion/react`), Vitest, Tailwind + shadcn, Geist.

**Approval gate (CLAUDE.md):** Before EVERY `git add`/`git commit`, summarize, show the diff, and **wait for explicit approval**.

**Node:** all `npm`/test commands need Node 22 — prefix with:
`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22`

**Design quality (CLAUDE.md):** the run card, evidence cards, and trace view are UI work — engage the **frontend-design skill** while building them, then a **design pass** on the trace view (Task 8). Use the locked tokens: deep-blue `#1E3A5F` accent (`--primary`), Geist Sans + Geist Mono (mono for tickers/tokens/cost), zinc neutrals, flat-over-carded, restrained Motion. Component code below is a token-correct first cut; the design pass polishes hierarchy/spacing/motion against the Linear bar.

**Carried-over facts:** tests are hermetic + DI (no DB/network); `@` alias + `server-only` stub already configured in `vitest.config.ts`; eslint ignores `_`-prefixed unused; `getThesisForUser`/`getAgentRunForUser`/`listIterations`/`listEvidenceForRun`/`triggerAgentRun` already exist; `AgentRun`/`AgentRunIteration`/`Evidence` types exported from `@/lib/db/schema`; `ActionResult` from `@/app/(app)/theses/actions`; `AGENT_RUN_STATUSES`/types from `@/schemas/agent`.

---

## File structure

**Create:**
- `lib/agent/cost.ts` (+ `.test.ts`) — `estimateRunCostUsd`, `formatUsd`.
- `lib/agent/trace.ts` (+ `.test.ts`) — defensive readers for `response_content` blocks + our `tool_calls` shape.
- `lib/agent/run-status.ts` (+ `.test.ts`) — `isTerminalStatus`, status display helpers.
- `components/agent/PollWhileRunning.tsx` — client interval → `router.refresh()`.
- `components/agent/AnalyzeNowButton.tsx` — client, calls `triggerAgentRun`.
- `components/agent/AgentRunPanel.tsx` — client, rail run card + recent runs.
- `components/agent/StatusPill.tsx` — presentational status pill.
- `components/agent/trace/RunHeader.tsx`, `IterationCard.tsx`, `ToolCallBlock.tsx`, `EvidenceCard.tsx` — trace presentational pieces (client where they animate).
- `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx` — trace sub-route (Server Component).

**Modify:**
- `lib/db/repositories/agent-runs.ts` — add `listAgentRunsForThesis`.
- `app/(app)/theses/[thesisId]/page.tsx` — wire `AnalyzeNowButton` (header) + `AgentRunPanel` (rail Analysis slot).
- `docs/DESIGN.md` — fill the trace-view block + decisions log.
- `package.json` — add `motion`.

---

### Task 1: Install Motion

**Files:** Modify `package.json`.

- [ ] **Step 1: Install**
Run:
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22
npm install motion
```
Expected: `package.json` gains `motion`. (Approved dep per the spec — Motion for the trace reveals.)

- [ ] **Step 2: Typecheck** → `npm run typecheck` clean.

- [ ] **Step 3: Commit** (after approval)
```bash
git add package.json package-lock.json
git commit -m "chore: add motion (animation library) for the trace view"
```

---

### Task 2: Cost utility (TDD)

**Files:** Create `lib/agent/cost.ts`, `lib/agent/cost.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { estimateRunCostUsd, formatUsd } from "./cost";

describe("estimateRunCostUsd (Opus 4.8: $5/MTok in, $25/MTok out)", () => {
  it("computes from input + output tokens", () => {
    expect(estimateRunCostUsd(1_000_000, 1_000_000)).toBeCloseTo(30, 5);
    expect(estimateRunCostUsd(0, 0)).toBe(0);
  });
  it("handles small realistic runs", () => {
    // 4500 in, 410 out → 4500/1e6*5 + 410/1e6*25 = 0.0225 + 0.01025 = 0.03275
    expect(estimateRunCostUsd(4500, 410)).toBeCloseTo(0.03275, 5);
  });
});

describe("formatUsd", () => {
  it("formats with a leading ~ and 2-4 dp depending on size", () => {
    expect(formatUsd(30)).toBe("~$30.00");
    expect(formatUsd(0.03275)).toBe("~$0.033");
    expect(formatUsd(0)).toBe("~$0.00");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run lib/agent/cost.test.ts`).

- [ ] **Step 3: Implement `lib/agent/cost.ts`**
```ts
// Opus 4.8 pricing (per 1M tokens). Update if CURRENT_MODEL changes.
const INPUT_PER_MTOK = 5;
const OUTPUT_PER_MTOK = 25;

export function estimateRunCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_PER_MTOK + (outputTokens / 1_000_000) * OUTPUT_PER_MTOK;
}

export function formatUsd(usd: number): string {
  // Sub-dollar runs need more precision; show 3 dp under $1, else 2 dp.
  const dp = usd > 0 && usd < 1 ? 3 : 2;
  return `~$${usd.toFixed(dp)}`;
}
```

- [ ] **Step 4: Run → PASS; typecheck.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/agent/cost.ts lib/agent/cost.test.ts
git commit -m "feat: add agent run cost estimate utility"
```

---

### Task 3: Trace-parsing helpers (TDD)

**Files:** Create `lib/agent/trace.ts`, `lib/agent/trace.test.ts`.

These read the jsonb persisted by the engine: `response_content` (Anthropic content blocks: `thinking`/`text`/`tool_use`) and `tool_calls` (our shape `[{tool_name, input, output?, error?}]`). Defensive — unknown/missing shapes yield empty, never throw.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { extractThinking, extractText, readToolCalls } from "./trace";

describe("trace readers", () => {
  it("extractThinking joins thinking blocks", () => {
    const content = [{ type: "thinking", thinking: "I will search." }, { type: "text", text: "ok" }];
    expect(extractThinking(content)).toBe("I will search.");
  });
  it("extractText joins text blocks", () => {
    const content = [{ type: "text", text: "Hello" }, { type: "tool_use", name: "x", input: {} }];
    expect(extractText(content)).toBe("Hello");
  });
  it("readToolCalls normalizes our shape and flags errors", () => {
    const tc = [
      { tool_name: "web_search", input: { query: "x" }, output: { results: [] } },
      { tool_name: "web_fetch", input: { url: "u" }, error: "Domain not allowed" },
    ];
    const out = readToolCalls(tc);
    expect(out).toHaveLength(2);
    expect(out[1].isError).toBe(true);
    expect(out[1].name).toBe("web_fetch");
  });
  it("is defensive against null/garbage", () => {
    expect(extractThinking(null)).toBe("");
    expect(extractText(undefined)).toBe("");
    expect(readToolCalls("nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/agent/trace.ts`**
```ts
type Block = { type?: string; thinking?: string; text?: string; name?: string; input?: unknown };

function asArray(v: unknown): Block[] {
  return Array.isArray(v) ? (v as Block[]) : [];
}

export function extractThinking(content: unknown): string {
  return asArray(content)
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string")
    .map((b) => b.thinking!.trim())
    .join("\n\n");
}

export function extractText(content: unknown): string {
  return asArray(content)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!.trim())
    .join("\n\n");
}

export type TraceToolCall = { name: string; input: unknown; output?: unknown; error?: string; isError: boolean };

export function readToolCalls(toolCalls: unknown): TraceToolCall[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((c) => {
    const tc = c as { tool_name?: string; input?: unknown; output?: unknown; error?: string };
    return {
      name: typeof tc.tool_name === "string" ? tc.tool_name : "unknown",
      input: tc.input,
      output: tc.output,
      error: tc.error,
      isError: typeof tc.error === "string" && tc.error.length > 0,
    };
  });
}
```

- [ ] **Step 4: Run → PASS; typecheck.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/agent/trace.ts lib/agent/trace.test.ts
git commit -m "feat: add defensive trace-parsing helpers"
```

---

### Task 4: Run-status helpers (TDD)

**Files:** Create `lib/agent/run-status.ts`, `lib/agent/run-status.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { isTerminalStatus, STATUS_LABEL } from "./run-status";

describe("isTerminalStatus", () => {
  it("non-terminal for queued/running", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
  it("terminal for complete/partial/failed", () => {
    expect(isTerminalStatus("complete")).toBe(true);
    expect(isTerminalStatus("partial")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });
});

describe("STATUS_LABEL", () => {
  it("has a human label per status", () => {
    expect(STATUS_LABEL.running).toBe("Running");
    expect(STATUS_LABEL.complete).toBe("Complete");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/agent/run-status.ts`**
```ts
import type { AgentRunStatus } from "@/schemas/agent";

const TERMINAL: ReadonlySet<AgentRunStatus> = new Set(["complete", "partial", "failed"]);

export function isTerminalStatus(status: AgentRunStatus): boolean {
  return TERMINAL.has(status);
}

export const STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  partial: "Partial",
  failed: "Failed",
};

// Tailwind classes per status for pills (deep-blue accent for active, calm tones otherwise).
export const STATUS_CLASS: Record<AgentRunStatus, string> = {
  queued: "bg-zinc-100 text-zinc-600",
  running: "bg-[#eef2f6] text-[#1E3A5F]",
  complete: "bg-[#eef4ef] text-[#1F7A4D]",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-[#fbf1ef] text-[#C0492F]",
};
```

- [ ] **Step 4: Run → PASS; typecheck.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/agent/run-status.ts lib/agent/run-status.test.ts
git commit -m "feat: add run-status terminal predicate and display maps"
```

---

### Task 5: Repository reads — `listAgentRunsForThesis` + `getSourcesByIds`

**Files:** Modify `lib/db/repositories/agent-runs.ts`, `lib/db/repositories/sources.ts`. (All DB access goes through repositories — the trace page must NOT query tables directly.)

- [ ] **Step 1: Append to `lib/db/repositories/agent-runs.ts`** (after `getAgentRunForUser`)
```ts
export async function listAgentRunsForThesis(userId: string, thesisId: string): Promise<AgentRun[]> {
  const rows = await db
    .select({ run: agentRuns })
    .from(agentRuns)
    .innerJoin(theses, eq(theses.id, agentRuns.thesisId))
    .where(and(eq(agentRuns.thesisId, thesisId), eq(theses.userId, userId)))
    .orderBy(desc(agentRuns.createdAt));
  return rows.map((r) => r.run);
}
```
Add `desc` to the `drizzle-orm` import if not present (the file already imports `and, eq, sql`).

- [ ] **Step 2: Append to `lib/db/repositories/sources.ts`**
```ts
import { inArray } from "drizzle-orm"; // add to the existing drizzle-orm import
import type { Source } from "@/lib/db/schema"; // ensure Source is imported

export async function getSourcesByIds(ids: string[]): Promise<Source[]> {
  if (ids.length === 0) return [];
  return db.select().from(sources).where(inArray(sources.id, ids));
}
```
(Sources are public/shared — no user scoping needed; the run that references them is already ownership-checked.)

- [ ] **Step 3: Typecheck + lint** → clean.

- [ ] **Step 4: Commit** (after approval)
```bash
git add lib/db/repositories/agent-runs.ts lib/db/repositories/sources.ts
git commit -m "feat: add listAgentRunsForThesis and getSourcesByIds reads"
```

---

### Task 6: Status pill + Analyze button + run panel + polling (detail-page integration)

**Files:** Create `components/agent/StatusPill.tsx`, `PollWhileRunning.tsx`, `AnalyzeNowButton.tsx`, `AgentRunPanel.tsx`; modify `app/(app)/theses/[thesisId]/page.tsx`.

> Engage the **frontend-design skill** while building these — the code below is a token-correct first cut.

- [ ] **Step 1: `components/agent/StatusPill.tsx`**
```tsx
import type { AgentRunStatus } from "@/schemas/agent";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/agent/run-status";

export function StatusPill({ status }: { status: AgentRunStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
      {(status === "running" || status === "queued") && (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
```

- [ ] **Step 2: `components/agent/PollWhileRunning.tsx`**
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentRunStatus } from "@/schemas/agent";
import { isTerminalStatus } from "@/lib/agent/run-status";

// Re-runs the Server Component every `intervalMs` while `status` is non-terminal.
export function PollWhileRunning({ status, intervalMs = 3000 }: { status: AgentRunStatus; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (isTerminalStatus(status)) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [status, intervalMs, router]);
  return null;
}
```

- [ ] **Step 3: `components/agent/AnalyzeNowButton.tsx`**
```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerAgentRun } from "@/app/(app)/theses/agent-actions";

export function AnalyzeNowButton({ thesisId, disabled }: { thesisId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          const res = await triggerAgentRun(thesisId);
          if (res.ok) router.refresh();
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Starting…" : disabled ? "Analyzing…" : "Analyze now"}
    </Button>
  );
}
```

- [ ] **Step 4: `components/agent/AgentRunPanel.tsx`**
```tsx
"use client";
import Link from "next/link";
import type { AgentRun } from "@/lib/db/schema";
import { StatusPill } from "@/components/agent/StatusPill";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { estimateRunCostUsd, formatUsd } from "@/lib/agent/cost";

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AgentRunPanel({ thesisId, runs }: { thesisId: string; runs: AgentRun[] }) {
  const latest = runs[0];
  if (!latest) {
    return <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-xs text-zinc-400">No analysis yet</div>;
  }
  return (
    <div className="space-y-2">
      {!isTerminalStatus(latest.status) && <PollWhileRunning status={latest.status} />}
      <Link
        href={`/theses/${thesisId}/runs/${latest.id}`}
        className="block rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50/70"
      >
        <div className="flex items-center justify-between">
          <StatusPill status={latest.status} />
          <span className="text-[11px] text-zinc-400">{timeAgo(latest.createdAt)}</span>
        </div>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {latest.iterationsUsed} iters · {latest.evidenceCollected} evidence · {formatUsd(estimateRunCostUsd(latest.inputTokens, latest.outputTokens))}
        </p>
        {latest.status === "failed" && latest.error && (
          <p className="mt-1 text-[11px] text-[#C0492F]">{latest.error}</p>
        )}
        <span className="mt-2 inline-block text-[11px] font-medium text-primary">View trace →</span>
      </Link>
      {runs.length > 1 && (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">{runs.length - 1} earlier {runs.length - 1 === 1 ? "run" : "runs"}</summary>
          <div className="mt-1 space-y-1">
            {runs.slice(1).map((r) => (
              <Link key={r.id} href={`/theses/${thesisId}/runs/${r.id}`} className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-zinc-50">
                <StatusPill status={r.status} />
                <span className="text-[11px] text-zinc-400">{timeAgo(r.createdAt)}</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire into `app/(app)/theses/[thesisId]/page.tsx`**

Add imports:
```tsx
import { listAgentRunsForThesis } from "@/lib/db/repositories/agent-runs";
import { AnalyzeNowButton } from "@/components/agent/AnalyzeNowButton";
import { AgentRunPanel } from "@/components/agent/AgentRunPanel";
import { isTerminalStatus } from "@/lib/agent/run-status";
```
After loading `thesis`, also load runs:
```tsx
const runs = await listAgentRunsForThesis(userId, thesis.id);
const activeRun = runs.find((r) => !isTerminalStatus(r.status));
```
Replace the header's disabled Tooltip "Analyze now" block (the `<Tooltip>…Available next phase…</Tooltip>`) with:
```tsx
<AnalyzeNowButton thesisId={thesis.id} disabled={Boolean(activeRun)} />
```
(Remove the now-unused `Tooltip`/`TooltipContent`/`TooltipTrigger` imports if nothing else uses them.)
Replace the rail "Analysis" placeholder `<div className="rounded-lg border border-dashed …">No analysis yet — available next phase</div>` with:
```tsx
<AgentRunPanel thesisId={thesis.id} runs={runs} />
```

- [ ] **Step 6: Verify** → `npm run typecheck && npm run lint` clean. Manual (with Inngest dev server + `USE_AI_FIXTURES=1`): click "Analyze now" → run card appears, polls queued→running→complete, counts + cost populate.

- [ ] **Step 7: Commit** (after approval)
```bash
git add components/agent/StatusPill.tsx components/agent/PollWhileRunning.tsx components/agent/AnalyzeNowButton.tsx components/agent/AgentRunPanel.tsx "app/(app)/theses/[thesisId]/page.tsx"
git commit -m "feat: wire Analyze now + live agent run panel into thesis detail"
```

---

### Task 7: Trace view sub-route + timeline components

**Files:** Create `components/agent/trace/{RunHeader,IterationCard,ToolCallBlock,EvidenceCard}.tsx`, `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`.

> Engage the **frontend-design skill** — this is the wow screen. Code below is the structural first cut (immersive single-column timeline, real tokens, Motion reveals).

- [ ] **Step 1: `components/agent/trace/EvidenceCard.tsx`**
```tsx
import type { Evidence } from "@/lib/db/schema";

export function EvidenceCard({ ev, domain }: { ev: Evidence; domain: string }) {
  return (
    <div className="my-2.5 rounded-lg border border-zinc-200 border-l-[3px] border-l-[#1F7A4D] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="font-mono">{domain}</span>
        {ev.claimIndices.map((i) => (
          <span key={i} className="rounded bg-[#eef4ef] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1F7A4D]">
            claim {i}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{ev.extractedText}</p>
    </div>
  );
}
```

- [ ] **Step 2: `components/agent/trace/ToolCallBlock.tsx`** (client — collapsible)
```tsx
"use client";
import { useState } from "react";
import type { TraceToolCall } from "@/lib/agent/trace";

export function ToolCallBlock({ call }: { call: TraceToolCall }) {
  const [open, setOpen] = useState(false);
  const argPreview = typeof call.input === "object" && call.input ? JSON.stringify(call.input) : String(call.input ?? "");
  return (
    <div className={`mb-2 overflow-hidden rounded-lg border ${call.isError ? "border-[#eccac1]" : "border-zinc-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${call.isError ? "bg-[#fbf1ef]" : "bg-zinc-50"}`}
      >
        <span className={`font-semibold ${call.isError ? "text-[#C0492F]" : "text-[#1E3A5F]"}`}>{call.name}</span>
        <span className="truncate font-mono text-zinc-500">{argPreview}</span>
        {call.isError && <span className="rounded border border-[#eccac1] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#C0492F]">refused</span>}
        <span className="ml-auto text-zinc-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-100 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
          {call.isError ? call.error : JSON.stringify(call.output, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `components/agent/trace/IterationCard.tsx`** (client — Motion reveal)
```tsx
"use client";
import { motion } from "motion/react";
import type { AgentRunIteration, Evidence, Source } from "@/lib/db/schema";
import { extractThinking, readToolCalls } from "@/lib/agent/trace";
import { ToolCallBlock } from "./ToolCallBlock";
import { EvidenceCard } from "./EvidenceCard";

export function IterationCard({
  iteration,
  active,
  evidence,
  sourcesById,
}: {
  iteration: AgentRunIteration;
  active: boolean;
  evidence: Evidence[];
  sourcesById: Map<string, Source>;
}) {
  const thinking = extractThinking(iteration.responseContent);
  const calls = readToolCalls(iteration.toolCalls);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative mb-7"
    >
      <span
        className={`absolute -left-[30px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 bg-white text-[10px] font-bold ${
          active ? "animate-pulse border-[#1E3A5F] text-[#1E3A5F]" : "border-[#1E3A5F] text-[#1E3A5F]"
        }`}
      >
        {iteration.iterationNumber + 1}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Iteration {iteration.iterationNumber + 1}
        </span>
        <span className="font-mono text-[11px] text-zinc-400">
          {iteration.inputTokens + iteration.outputTokens} tok · {(iteration.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      {thinking && (
        <p className="my-2 text-[13.5px] leading-relaxed text-zinc-600">
          <span className="mr-1.5 text-[11px] uppercase tracking-wide text-zinc-400">Reasoning</span>
          {thinking}
        </p>
      )}
      {calls.map((c, i) => (
        <ToolCallBlock key={i} call={c} />
      ))}
      {evidence.map((ev) => (
        <EvidenceCard key={ev.id} ev={ev} domain={sourcesById.get(ev.sourceId)?.domain ?? "source"} />
      ))}
    </motion.div>
  );
}
```

- [ ] **Step 4: `components/agent/trace/RunHeader.tsx`**
```tsx
import type { AgentRun } from "@/lib/db/schema";
import { StatusPill } from "@/components/agent/StatusPill";
import { estimateRunCostUsd, formatUsd } from "@/lib/agent/cost";

export function RunHeader({ run, ticker }: { run: AgentRun; ticker: string }) {
  const durationS =
    run.startedAt && run.completedAt
      ? ((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1) + "s"
      : "—";
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white/90 py-4 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Analysis run</h1>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
          <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono font-semibold text-zinc-600">{ticker}</span>
          <span><span className="font-mono text-zinc-700">{run.iterationsUsed}</span> iterations</span>
          <span><span className="font-mono text-zinc-700">{run.evidenceCollected}</span> evidence</span>
          <span className="font-mono text-zinc-700">{formatUsd(estimateRunCostUsd(run.inputTokens, run.outputTokens))}</span>
          <span className="font-mono text-zinc-700">{durationS}</span>
        </div>
      </div>
      <StatusPill status={run.status} />
    </div>
  );
}
```

- [ ] **Step 5: `app/(app)/theses/[thesisId]/runs/[runId]/page.tsx`** (Server Component)
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { getAgentRunForUser } from "@/lib/db/repositories/agent-runs";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { PollWhileRunning } from "@/components/agent/PollWhileRunning";
import { RunHeader } from "@/components/agent/trace/RunHeader";
import { IterationCard } from "@/components/agent/trace/IterationCard";

export default async function TracePage({
  params,
}: {
  params: Promise<{ thesisId: string; runId: string }>;
}) {
  const { thesisId, runId } = await params;
  const userId = await requireUserId();
  const [thesis, run] = await Promise.all([getThesisForUser(userId, thesisId), getAgentRunForUser(userId, runId)]);
  if (!thesis || !run || run.thesisId !== thesisId) notFound();

  const [iterations, evidence] = await Promise.all([listIterations(run.id), listEvidenceForRun(run.id)]);
  const srcRows = await getSourcesByIds([...new Set(evidence.map((e) => e.sourceId))]);
  const sourcesById = new Map(srcRows.map((s) => [s.id, s]));
  // Evidence is attached to the LAST iteration (return_result) in v1; group there.
  const lastIterId = iterations.at(-1)?.id;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/theses/${thesisId}`} className="text-xs text-zinc-400 hover:text-zinc-600">
        Theses / {thesis.ticker} / Run
      </Link>
      <RunHeader run={run} ticker={thesis.ticker} />
      {!isTerminalStatus(run.status) && <PollWhileRunning status={run.status} />}

      {run.status === "failed" && run.error && (
        <p className="mt-4 rounded-lg bg-[#fbf1ef] px-4 py-3 text-sm text-[#C0492F]">{run.error}</p>
      )}

      <div className="relative mt-6 pl-[30px]">
        <span className="absolute bottom-4 left-[9px] top-1.5 w-0.5 bg-zinc-200" aria-hidden />
        {iterations.map((it, idx) => (
          <IterationCard
            key={it.id}
            iteration={it}
            active={!isTerminalStatus(run.status) && idx === iterations.length - 1}
            evidence={it.id === lastIterId ? evidence : []}
            sourcesById={sourcesById}
          />
        ))}
        {iterations.length === 0 && (
          <p className="text-sm text-zinc-400">Waiting for the agent to start…</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify** → `npm run typecheck && npm run lint` clean. Manual: open a completed run's trace → timeline renders with reasoning, collapsible tool calls, inline evidence, sticky header + cost. Open the `no-evidence` run → timeline with the single return_result iteration, no evidence cards.

- [ ] **Step 7: Commit** (after approval)
```bash
git add components/agent/trace/ "app/(app)/theses/[thesisId]/runs/[runId]/page.tsx"
git commit -m "feat: add immersive agent run trace view"
```

> Note: in v1 the engine attaches all evidence at the `return_result` (final) iteration, so the trace groups evidence there. If a future engine change attaches evidence per-iteration, group `evidence` by an iteration reference instead of `lastIterId`.

---

### Task 8: Design pass on the trace view + DESIGN.md

**Files:** Modify trace components as needed; `docs/DESIGN.md`.

- [ ] **Step 1: Design pass.** Re-engage the **frontend-design skill**. Run the app (`npm run dev` + `npx inngest-cli dev`, `USE_AI_FIXTURES=1`), trigger a run, open the trace. Honestly assess against the Linear/Vercel/Granola bar: typographic hierarchy (reasoning vs labels vs mono data), spacing rhythm on the timeline, the reveal motion (springy-but-calm, not jarring), tool-call density, the running-pulse, the refusal treatment (clear, not alarming). Apply targeted refinements to the trace components. Keep within the locked tokens.

- [ ] **Step 2: Update `docs/DESIGN.md`.** Fill the "Agent run trace view" section with the locked decisions: full-width sub-route; immersive single-column timeline with numbered nodes; reasoning → collapsible tool calls → inline evidence; running-pulse node; brick "refused" chip; sticky status+cost header; polled incremental reveal with Motion spring/fade; cost estimate from Opus pricing. Add a dated decisions-log entry (2026-06-13). Also note the `/theses/[id]` rail now hosts the live `AgentRunPanel` (replacing the Phase-2 placeholder).

- [ ] **Step 3: Verify + commit** (after approval)
Run: `npm run typecheck && npm run lint && npm test` → clean.
```bash
git add docs/DESIGN.md components/agent/
git commit -m "docs: record trace-view design decisions; polish trace pass"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full sweep** → `npm test && npm run typecheck && npm run lint && npm run build` (Node 22) — all green; build includes `/theses/[thesisId]/runs/[runId]`.

- [ ] **Step 2: Manual end-to-end** (dev + `npx inngest-cli dev`, `USE_AI_FIXTURES=1`): from a thesis, "Analyze now" → rail card polls to Complete with counts+cost → "View trace" → immersive timeline with reasoning/tool calls/evidence/cost. Repeat triggering against the `no-evidence` scenario (the trigger action already passes `nvda-happy-path`; to exercise no-evidence, temporarily pass that scenario or trigger via the Inngest dev dashboard) and confirm the empty-evidence trace + run card read sensibly. Confirm a second run shows the "earlier runs" disclosure.

- [ ] **Step 3:** No commit (verification only) unless fixes were needed.

---

## Self-review notes (author)

- **Spec coverage:** Analyze-now wired (T6); rail run panel with states/counts/cost/recent-runs (T6); polling via `router.refresh` (T4 predicate + T6/T7 `PollWhileRunning`); trace sub-route + immersive timeline + running-pulse + refusal treatment + sticky header (T7); cost util (T2); defensive trace parsing (T3); `listAgentRunsForThesis` (T5); Motion dep (T1); frontend-design + design pass + DESIGN.md (T8); verification (T9). Error/empty/partial/failed states covered in `AgentRunPanel` + trace page. Out-of-scope (eval/health, demo seed, SSE) untouched.
- **Verify-at-execution:** confirm the exact JSX of the Phase-2 detail page's Tooltip "Analyze now" block + the rail "Analysis" placeholder before replacing (T6 Step 5) — match whatever is there. Confirm `motion/react` import resolves under the build. Evidence-grouping assumption (all evidence on the final iteration) is documented in T7; revisit if the engine changes.
- **Design note:** the component code is a token-correct first cut; T8's frontend-design pass is where the trace view earns "wow." Don't skip it.
