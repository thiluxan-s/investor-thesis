# Phase 3a — Researcher Agent Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `triggerAgentRun(thesisId)` Server Action kicks off an Inngest background function that runs a hand-written Claude (Opus 4.8) tool-use loop, gathering evidence via four custom tools and persisting a full trace + evidence — runnable entirely offline from fixtures.

**Architecture:** Server Action creates an `agent_runs` row and sends an Inngest event. The `run-agent` Inngest function loads the thesis/claims/seen-list, then drives `lib/ai/agents/researcher.ts` — a `while` loop with explicit stop conditions, one durable `step.run` per iteration. Each iteration calls the Anthropic client wrapper (which replays fixtures when `USE_AI_FIXTURES=1`), validates + executes tool calls, and persists the iteration + any evidence. All DB access goes through repositories; all tool I/O is injectable for hermetic tests.

**Tech Stack:** Next.js 16, TS strict, Drizzle (neon-http + pgvector), `@anthropic-ai/sdk`, `inngest`, `turndown` (HTML→markdown), Brave Search API, Zod v4, Vitest.

**Approval gate (CLAUDE.md):** Before EVERY `git add`/`git commit` step, summarize, show the diff, and **wait for explicit approval**. Commit steps below are the intended commit — don't run them unprompted.

**Node:** all `npm`/`npx`/test commands need Node 22 — prefix with:
`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22`

**Carried-over lessons:** neon-http has no `db.transaction()` — use `db.batch`. Tests are hermetic (no DB/network) and use dependency injection like `lib/clerk/handle-user-event.test.ts`. The `@` alias resolves in Vitest (configured in Phase 2). Match existing patterns: `import "server-only"` on DB/AI server modules, `@/` imports, enum tuples duplicated client-safe with a drift-guard test.

---

## File structure

**Create:**
- `schemas/agent.ts` — client-safe enum tuples + AI Zod schemas (`EvidenceItemSchema`, `ReturnResultSchema`, tool input schemas) + types.
- `lib/ai/allow-list.ts` — domain allow-list + `isAllowedDomain(url)`.
- `lib/ai/url.ts` — `normalizeUrl`, `sha256`, `urlHash`, `hostnameOf`.
- `lib/ai/text.ts` — `truncateToBytes(text, max)`.
- `lib/ai/tools/types.ts` — `Tool`, `ToolContext`, `ToolResult` interfaces; `SearchProvider` interface.
- `lib/ai/tools/providers/brave.ts` — Brave `SearchProvider`.
- `lib/ai/tools/web-search.ts`, `web-fetch.ts`, `edgar.ts`, `return-result.ts`.
- `lib/ai/tools/registry.ts` — tool list + `executeToolCallSafely`.
- `lib/ai/prompts/researcher.ts` — `systemPrompt`, `buildResearchTask`.
- `lib/ai/client.ts` — Anthropic wrapper + fixture record/replay.
- `lib/ai/fixtures.ts` — fixture read/write helpers.
- `lib/ai/agents/researcher.ts` — the loop.
- `lib/db/repositories/sources.ts`, `agent-runs.ts`, `agent-run-iterations.ts`, `evidence.ts`.
- `lib/inngest/client.ts`, `lib/inngest/functions/run-agent.ts`.
- `app/api/inngest/route.ts`.
- `app/(app)/theses/agent-actions.ts` — `triggerAgentRun`.
- `__fixtures__/agent-runs/nvda-happy-path/`, `__fixtures__/agent-runs/no-evidence/`.
- Test files alongside the units (see tasks).

**Modify:** `lib/db/schema.ts` (4 tables + enums + pgvector), `lib/env.server.ts` (+ `.env.example`), `package.json` (deps), `drizzle/` (migration).

---

### Task 1: Install dependencies

**Files:** Modify `package.json` (+ lockfile).

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22
npm install @anthropic-ai/sdk inngest turndown
npm install -D @types/turndown
```
Expected: installs cleanly; `package.json` gains `@anthropic-ai/sdk`, `inngest`, `turndown`, and dev `@types/turndown`.

- [ ] **Step 2: Verify typecheck still clean**

Run: `npm run typecheck`
Expected: clean (no usages yet).

- [ ] **Step 3: Commit** (after approval)
```bash
git add package.json package-lock.json
git commit -m "chore: add anthropic sdk, inngest, turndown deps"
```

> Dependency-approval gate (CLAUDE.md): these four deps are the spec's planned additions. If `npm install` pulls a major peer warning or a dep not listed here, stop and report before committing.

---

### Task 2: Schema + migration (sources, agent_runs, agent_run_iterations, evidence, pgvector)

**Files:** Modify `lib/db/schema.ts`; generate `drizzle/`.

- [ ] **Step 1: Append to `lib/db/schema.ts`**

Add `integer`, `jsonb`, `vector` to the `drizzle-orm/pg-core` import (keep existing names). Append below the Phase 2 tables:

```ts
// Enum values mirror schemas/agent.ts — keep in sync.
export const agentRunStatus = pgEnum("agent_run_status", [
  "queued",
  "running",
  "complete",
  "partial",
  "failed",
]);
export const agentRunTrigger = pgEnum("agent_run_trigger", ["manual", "scheduled"]);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull().unique(),
    domain: text("domain").notNull(),
    title: text("title"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    rawContentHash: text("raw_content_hash"),
    contentExcerpt: text("content_excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sources_domain_idx").on(t.domain), index("sources_raw_content_hash_idx").on(t.rawContentHash)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    status: agentRunStatus("status").notNull().default("queued"),
    trigger: agentRunTrigger("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    iterationsUsed: integer("iterations_used").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    evidenceCollected: integer("evidence_collected").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("agent_runs_thesis_id_idx").on(t.thesisId)],
);

export const agentRunIterations = pgTable(
  "agent_run_iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    iterationNumber: integer("iteration_number").notNull(),
    requestMessages: jsonb("request_messages").notNull(),
    responseContent: jsonb("response_content").notNull(),
    toolCalls: jsonb("tool_calls"),
    stopReason: text("stop_reason"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_run_iterations_run_iter_idx").on(t.agentRunId, t.iterationNumber)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    extractedText: text("extracted_text").notNull(),
    extractedTextEmbedding: vector("extracted_text_embedding", { dimensions: 1536 }),
    claimIndices: integer("claim_indices").array().notNull().default([]),
    agentReasoning: text("agent_reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evidence_agent_run_id_idx").on(t.agentRunId), index("evidence_source_id_idx").on(t.sourceId)],
);

export type Source = typeof sources.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunIteration = typeof agentRunIterations.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
```

- [ ] **Step 2: Enable pgvector before generating**

The migration must `CREATE EXTENSION` before creating the `evidence` table. Generate first, then hand-edit the generated SQL to add the extension line at the very top (drizzle-kit doesn't emit it):

Run: `npm run db:generate`
Then open the new `drizzle/000X_*.sql` and add as the FIRST line:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
```
Confirm the file also has `CREATE TYPE` for both enums, `CREATE TABLE` for all four tables, the FKs (`agent_runs`/`agent_run_iterations`/`evidence` cascade; `evidence.source_id` no cascade), `"extracted_text_embedding" vector(1536)`, `"claim_indices" integer[] DEFAULT '{}'`, and the indexes.

- [ ] **Step 3: Apply the migration**

Run: `npm run db:migrate`
Expected: applies cleanly (extension + tables created on Neon).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add sources, agent_runs, iterations, evidence schema + pgvector"
```

---

### Task 3: Agent enum tuples + drift-guard test

**Files:** Create `schemas/agent.ts`, `lib/db/agent-enum-sync.test.ts`.

- [ ] **Step 1: Write `schemas/agent.ts` (enum tuples only for now)**

```ts
// Enum value tuples — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here (zod only). The drift-guard test asserts they match.
export const AGENT_RUN_STATUSES = ["queued", "running", "complete", "partial", "failed"] as const;
export const AGENT_RUN_TRIGGERS = ["manual", "scheduled"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunTrigger = (typeof AGENT_RUN_TRIGGERS)[number];
```

- [ ] **Step 2: Write the failing drift-guard test `lib/db/agent-enum-sync.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { AGENT_RUN_STATUSES, AGENT_RUN_TRIGGERS } from "@/schemas/agent";
import { agentRunStatus, agentRunTrigger } from "@/lib/db/schema";

describe("agent enum tuples stay in sync with pgEnums", () => {
  it("agent_run_status", () => {
    expect([...agentRunStatus.enumValues]).toEqual([...AGENT_RUN_STATUSES]);
  });
  it("agent_run_trigger", () => {
    expect([...agentRunTrigger.enumValues]).toEqual([...AGENT_RUN_TRIGGERS]);
  });
});
```

- [ ] **Step 3: Run → expect PASS** (both modules already exist after Task 2)

Run: `npx vitest run lib/db/agent-enum-sync.test.ts` → PASS (4 assertions across 2 tests... 2 tests pass).

- [ ] **Step 4: Commit** (after approval)
```bash
git add schemas/agent.ts lib/db/agent-enum-sync.test.ts
git commit -m "feat: add agent enum tuples with drift-guard test"
```

---

### Task 4: Pure helpers — URL, hashing, allow-list, truncation (TDD)

**Files:** Create `lib/ai/url.ts`, `lib/ai/allow-list.ts`, `lib/ai/text.ts` + tests.

- [ ] **Step 1: Write failing tests `lib/ai/url.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, urlHash, hostnameOf } from "./url";

describe("normalizeUrl", () => {
  it("lowercases host, drops trailing slash and default fragments", () => {
    expect(normalizeUrl("HTTPS://Reuters.com/article/x/")).toBe("https://reuters.com/article/x");
    expect(normalizeUrl("https://reuters.com/a#section")).toBe("https://reuters.com/a");
  });
  it("strips tracking query params but keeps meaningful ones", () => {
    expect(normalizeUrl("https://x.com/a?utm_source=g&id=5")).toBe("https://x.com/a?id=5");
  });
});

describe("urlHash", () => {
  it("is stable and equal for URLs that normalize the same", () => {
    expect(urlHash("https://reuters.com/a/")).toBe(urlHash("HTTPS://reuters.com/a"));
  });
});

describe("hostnameOf", () => {
  it("returns the lowercased hostname", () => {
    expect(hostnameOf("https://Finance.Yahoo.com/x")).toBe("finance.yahoo.com");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run lib/ai/url.test.ts`, cannot resolve `./url`).

- [ ] **Step 3: Implement `lib/ai/url.ts`**

```ts
import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ref",
]);

export function normalizeUrl(input: string): string {
  const u = new URL(input);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  let s = u.toString();
  // Drop a single trailing slash on the path (but not the bare-host root).
  s = s.replace(/\/(?=$|\?)/, (m, offset) => (s[offset - 1] === "/" ? m : ""));
  return s.replace(/\/$/, (m, offset) => (offset > "https://".length && s[offset - 1] !== "/" ? "" : m));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function urlHash(input: string): string {
  return sha256(normalizeUrl(input));
}

export function hostnameOf(input: string): string {
  return new URL(input).hostname.toLowerCase();
}
```

> Note for implementer: the trailing-slash regex above is fiddly. If a test fails on an edge case, simplify to: build the URL, then `s = u.origin + u.pathname.replace(/\/$/, "") + (u.search ? u.search : "")`. Prefer whichever passes the tests cleanly; keep the public behavior the tests assert.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Write failing tests `lib/ai/allow-list.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isAllowedDomain } from "./allow-list";

describe("isAllowedDomain", () => {
  it("allows listed domains and their subdomains", () => {
    expect(isAllowedDomain("https://www.reuters.com/x")).toBe(true);
    expect(isAllowedDomain("https://reuters.com/x")).toBe(true);
    expect(isAllowedDomain("https://data.sec.gov/x")).toBe(true);
    expect(isAllowedDomain("https://investor.nvidia.com/x")).toBe(true);
  });
  it("rejects unlisted domains", () => {
    expect(isAllowedDomain("https://randomblog.example/x")).toBe(false);
    expect(isAllowedDomain("https://notreuters.com.evil.test/x")).toBe(false);
  });
});
```

- [ ] **Step 6: Run → FAIL.**

- [ ] **Step 7: Implement `lib/ai/allow-list.ts`**

```ts
import { hostnameOf } from "./url";

// Reputable news / IR / research / finance + SEC. Editable.
export const ALLOWED_DOMAINS = [
  "sec.gov",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "cnbc.com",
  "marketwatch.com",
  "barrons.com",
  "finance.yahoo.com",
  "seekingalpha.com",
  "fool.com",
  "theverge.com",
  "arstechnica.com",
  "semianalysis.com",
] as const;

// Company investor-relations subdomains are allowed via this prefix check.
const IR_SUBDOMAIN = /^investor[s]?\./;

export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = hostnameOf(url);
  } catch {
    return false;
  }
  if (IR_SUBDOMAIN.test(host)) return true;
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
```

- [ ] **Step 8: Run → PASS.**

- [ ] **Step 9: Write failing test `lib/ai/text.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { truncateToBytes } from "./text";

describe("truncateToBytes", () => {
  it("returns short input unchanged", () => {
    expect(truncateToBytes("hello", 8192)).toBe("hello");
  });
  it("truncates to at most the byte budget", () => {
    const big = "x".repeat(20000);
    const out = truncateToBytes(big, 8192);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(8192);
  });
});
```

- [ ] **Step 10: Run → FAIL.**

- [ ] **Step 11: Implement `lib/ai/text.ts`**

```ts
export function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Truncate by bytes, then trim any partial trailing UTF-8 sequence.
  const buf = Buffer.from(text, "utf8").subarray(0, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(buf).replace(/�+$/, "");
}
```

- [ ] **Step 12: Run → PASS, then typecheck + lint.**

Run: `npx vitest run lib/ai/ && npm run typecheck && npm run lint` → all clean.

- [ ] **Step 13: Commit** (after approval)
```bash
git add lib/ai/url.ts lib/ai/url.test.ts lib/ai/allow-list.ts lib/ai/allow-list.test.ts lib/ai/text.ts lib/ai/text.test.ts
git commit -m "feat: add url/hash, domain allow-list, and byte-truncation helpers"
```

---

### Task 5: AI Zod schemas (tool inputs + EvidenceItem/return_result) (TDD)

**Files:** Append to `schemas/agent.ts`; create `schemas/agent.test.ts`.

- [ ] **Step 1: Write failing test `schemas/agent.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  WebSearchInputSchema,
  WebFetchInputSchema,
  EdgarInputSchema,
  ReturnResultSchema,
} from "./agent";

describe("tool input schemas", () => {
  it("web_search requires a query, caps limit at 10", () => {
    expect(WebSearchInputSchema.safeParse({ query: "nvda revenue" }).success).toBe(true);
    expect(WebSearchInputSchema.safeParse({ query: "x", limit: 20 }).success).toBe(false);
    expect(WebSearchInputSchema.safeParse({}).success).toBe(false);
  });
  it("web_fetch requires a url", () => {
    expect(WebFetchInputSchema.safeParse({ url: "https://reuters.com/a" }).success).toBe(true);
    expect(WebFetchInputSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });
  it("edgar requires a ticker, optional formType enum", () => {
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA" }).success).toBe(true);
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA", formType: "10-K" }).success).toBe(true);
    expect(EdgarInputSchema.safeParse({ ticker: "NVDA", formType: "8-Q" }).success).toBe(false);
  });
  it("return_result validates evidence items", () => {
    const ok = {
      evidence: [
        { source_url: "https://reuters.com/a", title: "T", snippet: "s", claim_indices: [0], extracted_text: "text here" },
      ],
    };
    expect(ReturnResultSchema.safeParse(ok).success).toBe(true);
    expect(ReturnResultSchema.safeParse({ evidence: [{ source_url: "x" }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run schemas/agent.test.ts`).

- [ ] **Step 3: Append to `schemas/agent.ts`**

```ts
import { z } from "zod";

export const FORM_TYPES = ["10-K", "10-Q", "8-K"] as const;

export const WebSearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

export const WebFetchInputSchema = z.object({
  url: z.string().url(),
});

export const EdgarInputSchema = z.object({
  ticker: z.string().min(1),
  formType: z.enum(FORM_TYPES).optional(),
});

export const EvidenceItemSchema = z.object({
  source_url: z.string().url(),
  title: z.string().min(1),
  snippet: z.string().min(1),
  claim_indices: z.array(z.number().int().min(0)),
  extracted_text: z.string().min(1),
});

export const ReturnResultSchema = z.object({
  evidence: z.array(EvidenceItemSchema),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
export type EdgarInput = z.infer<typeof EdgarInputSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
```

- [ ] **Step 4: Run → PASS; typecheck.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add schemas/agent.ts schemas/agent.test.ts
git commit -m "feat: add AI tool-input and return_result Zod schemas"
```

---

### Task 6: Tool interfaces + Brave provider + web_search tool (TDD)

**Files:** Create `lib/ai/tools/types.ts`, `lib/ai/tools/providers/brave.ts`, `lib/ai/tools/web-search.ts`, `lib/ai/tools/web-search.test.ts`.

- [ ] **Step 1: Implement `lib/ai/tools/types.ts`** (interfaces only — no test needed)

```ts
import "server-only";
import type { z } from "zod";

export type SearchResult = { title: string; url: string; snippet: string };
export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

// Evidence the tools surface to the loop for persistence.
export type CollectedEvidence = {
  sourceUrl: string;
  title: string;
  domain: string;
  rawContentHash: string;
  contentExcerpt: string;
};

export type ToolContext = {
  search: SearchProvider;
  fetcher: (url: string) => Promise<{ status: number; html: string; finalUrl: string }>;
  edgarClient: (ticker: string, formType?: string) => Promise<{ form: string; filedAt: string; url: string }[]>;
  useFixtures: boolean;
  scenario?: string;
};

export type ToolResult = { ok: true; output: unknown } | { ok: false; error: string };

export interface Tool<I = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  execute(input: I, ctx: ToolContext): Promise<ToolResult>;
}
```

- [ ] **Step 2: Implement `lib/ai/tools/providers/brave.ts`**

```ts
import "server-only";
import type { SearchProvider, SearchResult } from "@/lib/ai/tools/types";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export function createBraveProvider(apiKey: string): SearchProvider {
  return {
    async search(query: string, limit: number): Promise<SearchResult[]> {
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(limit));
      const res = await fetch(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      });
      if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
      const data = (await res.json()) as { web?: { results?: { title: string; url: string; description: string }[] } };
      return (data.web?.results ?? []).slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));
    },
  };
}
```

- [ ] **Step 3: Write failing test `lib/ai/tools/web-search.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { webSearchTool } from "./web-search";
import type { ToolContext } from "./types";

function ctx(results: { title: string; url: string; snippet: string }[]): ToolContext {
  return {
    search: { search: vi.fn().mockResolvedValue(results) },
    fetcher: vi.fn(),
    edgarClient: vi.fn(),
    useFixtures: false,
  };
}

describe("webSearchTool", () => {
  it("returns provider results", async () => {
    const c = ctx([{ title: "T", url: "https://reuters.com/a", snippet: "s" }]);
    const res = await webSearchTool.execute({ query: "nvda", limit: 5 }, c);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toEqual({ results: [{ title: "T", url: "https://reuters.com/a", snippet: "s" }] });
    expect(c.search.search).toHaveBeenCalledWith("nvda", 5);
  });
  it("defaults limit to 5 when omitted", async () => {
    const c = ctx([]);
    await webSearchTool.execute({ query: "x" }, c);
    expect(c.search.search).toHaveBeenCalledWith("x", 5);
  });
  it("returns a tool error when the provider throws", async () => {
    const c = ctx([]);
    (c.search.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("rate limited"));
    const res = await webSearchTool.execute({ query: "x" }, c);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 4: Run → FAIL.**

- [ ] **Step 5: Implement `lib/ai/tools/web-search.ts`**

```ts
import "server-only";
import { WebSearchInputSchema, type WebSearchInput } from "@/schemas/agent";
import type { Tool, ToolContext, ToolResult } from "./types";

export const webSearchTool: Tool<WebSearchInput> = {
  name: "web_search",
  description:
    "Search the web for recent, relevant pages. Returns a list of {title, url, snippet}. " +
    "Use it to find candidate sources, then call web_fetch to read the promising ones.",
  inputSchema: WebSearchInputSchema,
  async execute(input: WebSearchInput, ctx: ToolContext): Promise<ToolResult> {
    try {
      const results = await ctx.search.search(input.query, input.limit ?? 5);
      return { ok: true, output: { results } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "web_search failed" };
    }
  },
};
```

- [ ] **Step 6: Run → PASS; typecheck.**

- [ ] **Step 7: Commit** (after approval)
```bash
git add lib/ai/tools/types.ts lib/ai/tools/providers/brave.ts lib/ai/tools/web-search.ts lib/ai/tools/web-search.test.ts
git commit -m "feat: add tool interfaces, Brave provider, and web_search tool"
```

---

### Task 7: web_fetch tool (allow-list, truncate, HTML→markdown, source dedup) (TDD)

**Files:** Create `lib/ai/tools/web-fetch.ts`, `lib/ai/tools/web-fetch.test.ts`.

The tool returns markdown to the agent AND surfaces a `CollectedEvidence`-shaped source record (via the result `output.source`) that the loop persists through the `sources` repo. It does NOT import the repo directly (keeps it hermetic + testable); persistence happens in the loop.

- [ ] **Step 1: Write failing test `lib/ai/tools/web-fetch.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { webFetchTool } from "./web-fetch";
import type { ToolContext } from "./types";

function ctx(fetcher: ToolContext["fetcher"]): ToolContext {
  return { search: { search: vi.fn() }, fetcher, edgarClient: vi.fn(), useFixtures: false };
}

describe("webFetchTool", () => {
  it("refuses domains not on the allow-list without fetching", async () => {
    const fetcher = vi.fn();
    const res = await webFetchTool.execute({ url: "https://randomblog.example/x" }, ctx(fetcher));
    expect(res.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fetches an allow-listed url, converts to markdown, truncates, and returns a source", async () => {
    const html = "<html><head><title>NV Q3</title></head><body><h1>Revenue</h1><p>" + "x".repeat(20000) + "</p></body></html>";
    const fetcher = vi.fn().mockResolvedValue({ status: 200, html, finalUrl: "https://reuters.com/a" });
    const res = await webFetchTool.execute({ url: "https://reuters.com/a" }, ctx(fetcher));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const out = res.output as { markdown: string; source: { domain: string; contentExcerpt: string } };
      expect(out.source.domain).toBe("reuters.com");
      expect(Buffer.byteLength(out.source.contentExcerpt, "utf8")).toBeLessThanOrEqual(8192);
      expect(out.markdown).toContain("Revenue");
    }
  });
  it("returns a tool error on non-200", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 404, html: "", finalUrl: "https://reuters.com/a" });
    const res = await webFetchTool.execute({ url: "https://reuters.com/a" }, ctx(fetcher));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/ai/tools/web-fetch.ts`**

```ts
import "server-only";
import TurndownService from "turndown";
import { WebFetchInputSchema, type WebFetchInput } from "@/schemas/agent";
import { isAllowedDomain } from "@/lib/ai/allow-list";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import { truncateToBytes } from "@/lib/ai/text";
import type { Tool, ToolContext, ToolResult } from "./types";

const MAX_BYTES = 8192;
const turndown = new TurndownService({ headingStyle: "atx" });

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

export const webFetchTool: Tool<WebFetchInput> = {
  name: "web_fetch",
  description:
    "Fetch a single allow-listed URL and return its main content as markdown (truncated). " +
    "Only reputable news, investor-relations, and SEC/EDGAR domains are permitted; others are refused.",
  inputSchema: WebFetchInputSchema,
  async execute(input: WebFetchInput, ctx: ToolContext): Promise<ToolResult> {
    if (!isAllowedDomain(input.url)) {
      return { ok: false, error: `Domain not allowed: ${input.url}. Choose a reputable news/IR/SEC source.` };
    }
    try {
      const { status, html, finalUrl } = await ctx.fetcher(input.url);
      if (status !== 200) return { ok: false, error: `Fetch returned status ${status}` };
      const markdown = truncateToBytes(turndown.turndown(html), MAX_BYTES);
      const title = extractTitle(html);
      const source = {
        sourceUrl: finalUrl,
        title,
        domain: hostnameOf(finalUrl),
        rawContentHash: sha256(html),
        contentExcerpt: markdown,
      };
      return { ok: true, output: { url: finalUrl, title, markdown, source } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "web_fetch failed" };
    }
  },
};
```

- [ ] **Step 4: Run → PASS; typecheck + lint.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/ai/tools/web-fetch.ts lib/ai/tools/web-fetch.test.ts
git commit -m "feat: add web_fetch tool with allow-list, truncation, and markdown conversion"
```

---

### Task 8: edgar tool (TDD)

**Files:** Create `lib/ai/tools/edgar.ts`, `lib/ai/tools/edgar.test.ts`.

- [ ] **Step 1: Write failing test `lib/ai/tools/edgar.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { edgarTool } from "./edgar";
import type { ToolContext } from "./types";

function ctx(edgarClient: ToolContext["edgarClient"]): ToolContext {
  return { search: { search: vi.fn() }, fetcher: vi.fn(), edgarClient, useFixtures: false };
}

describe("edgarTool", () => {
  it("returns filings from the edgar client", async () => {
    const filings = [{ form: "10-Q", filedAt: "2026-02-01", url: "https://www.sec.gov/x" }];
    const c = ctx(vi.fn().mockResolvedValue(filings));
    const res = await edgarTool.execute({ ticker: "NVDA", formType: "10-Q" }, c);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toEqual({ filings });
    expect(c.edgarClient).toHaveBeenCalledWith("NVDA", "10-Q");
  });
  it("returns a tool error when the client throws", async () => {
    const c = ctx(vi.fn().mockRejectedValue(new Error("not found")));
    const res = await edgarTool.execute({ ticker: "ZZZZ" }, c);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/ai/tools/edgar.ts`**

```ts
import "server-only";
import { EdgarInputSchema, type EdgarInput } from "@/schemas/agent";
import type { Tool, ToolContext, ToolResult } from "./types";

export const edgarTool: Tool<EdgarInput> = {
  name: "edgar",
  description:
    "Look up a company's recent SEC filings by ticker (optionally filtered to 10-K/10-Q/8-K). " +
    "Returns {form, filedAt, url}; pass a filing url to web_fetch to read it.",
  inputSchema: EdgarInputSchema,
  async execute(input: EdgarInput, ctx: ToolContext): Promise<ToolResult> {
    try {
      const filings = await ctx.edgarClient(input.ticker, input.formType);
      return { ok: true, output: { filings } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "edgar lookup failed" };
    }
  },
};
```

- [ ] **Step 4: Run → PASS; typecheck.**

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/ai/tools/edgar.ts lib/ai/tools/edgar.test.ts
git commit -m "feat: add edgar SEC-filing lookup tool"
```

> The real EDGAR client implementation (`data.sec.gov` calls with `EDGAR_USER_AGENT`) is wired in the `ToolContext` builder in Task 15; the tool itself is client-agnostic and hermetically tested here.

---

### Task 9: return_result tool + tool registry + safe executor (TDD)

**Files:** Create `lib/ai/tools/return-result.ts`, `lib/ai/tools/registry.ts`, `lib/ai/tools/registry.test.ts`.

- [ ] **Step 1: Implement `lib/ai/tools/return-result.ts`**

```ts
import "server-only";
import { ReturnResultSchema } from "@/schemas/agent";
import type { Tool, ToolContext, ToolResult } from "./types";
import type { z } from "zod";

type ReturnResultInput = z.infer<typeof ReturnResultSchema>;

// The loop intercepts return_result as the completion signal; execute() is a
// no-op echo so the tool conforms to the Tool interface.
export const returnResultTool: Tool<ReturnResultInput> = {
  name: "return_result",
  description:
    "Call this exactly once when you are done. Provide the final list of evidence items you gathered. " +
    "This ends the research run.",
  inputSchema: ReturnResultSchema,
  async execute(input: ReturnResultInput, _ctx: ToolContext): Promise<ToolResult> {
    return { ok: true, output: input };
  },
};
```

- [ ] **Step 2: Write failing test `lib/ai/tools/registry.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { TOOLS, toolByName, executeToolCallSafely } from "./registry";
import type { ToolContext } from "./types";

const ctx: ToolContext = {
  search: { search: vi.fn().mockResolvedValue([]) },
  fetcher: vi.fn(),
  edgarClient: vi.fn(),
  useFixtures: false,
};

describe("tool registry", () => {
  it("exposes the four tools by name", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(["edgar", "return_result", "web_fetch", "web_search"]);
    expect(toolByName("web_search")?.name).toBe("web_search");
    expect(toolByName("nope")).toBeUndefined();
  });
  it("returns a tool error for an unknown tool", async () => {
    const r = await executeToolCallSafely("nope", {}, ctx);
    expect(r.ok).toBe(false);
  });
  it("returns a tool error for invalid input instead of throwing", async () => {
    const r = await executeToolCallSafely("web_search", { limit: 99 }, ctx); // missing query, bad limit
    expect(r.ok).toBe(false);
  });
  it("executes a valid call", async () => {
    const r = await executeToolCallSafely("web_search", { query: "x" }, ctx);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement `lib/ai/tools/registry.ts`**

```ts
import "server-only";
import type { Tool, ToolContext, ToolResult } from "./types";
import { webSearchTool } from "./web-search";
import { webFetchTool } from "./web-fetch";
import { edgarTool } from "./edgar";
import { returnResultTool } from "./return-result";

export const TOOLS: Tool[] = [webSearchTool, webFetchTool, edgarTool, returnResultTool] as Tool[];

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function executeToolCallSafely(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.issues[0]?.message ?? "validation failed"}` };
  }
  return tool.execute(parsed.data, ctx);
}
```

- [ ] **Step 5: Run → PASS; typecheck.**

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/ai/tools/return-result.ts lib/ai/tools/registry.ts lib/ai/tools/registry.test.ts
git commit -m "feat: add return_result tool, registry, and safe tool executor"
```

---

### Task 10: Repositories

**Files:** Create `lib/db/repositories/sources.ts`, `agent-runs.ts`, `agent-run-iterations.ts`, `evidence.ts`. (No unit tests — no test DB; verified via the fixtured end-to-end run in Task 17.)

- [ ] **Step 1: Implement `lib/db/repositories/sources.ts`**

```ts
import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sources, evidence, agentRuns, theses, type Source } from "@/lib/db/schema";
import { urlHash } from "@/lib/ai/url";

export async function findOrCreateSource(input: {
  url: string;
  domain: string;
  title: string | null;
  rawContentHash: string;
  contentExcerpt: string;
}): Promise<Source> {
  const hash = urlHash(input.url);
  const [existing] = await db.select().from(sources).where(eq(sources.urlHash, hash)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(sources)
    .values({
      url: input.url,
      urlHash: hash,
      domain: input.domain,
      title: input.title,
      rawContentHash: input.rawContentHash,
      contentExcerpt: input.contentExcerpt,
    })
    .onConflictDoNothing({ target: sources.urlHash })
    .returning();
  if (row) return row;
  // Lost a race — fetch the row the other writer created.
  const [raced] = await db.select().from(sources).where(eq(sources.urlHash, hash)).limit(1);
  return raced;
}

export async function listRecentSourceUrlsForThesis(thesisId: string, sinceDays: number): Promise<string[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .selectDistinct({ url: sources.url })
    .from(sources)
    .innerJoin(evidence, eq(evidence.sourceId, sources.id))
    .innerJoin(agentRuns, eq(agentRuns.id, evidence.agentRunId))
    .where(and(eq(agentRuns.thesisId, thesisId), gte(sources.createdAt, since)));
  return rows.map((r) => r.url);
}
```

- [ ] **Step 2: Implement `lib/db/repositories/agent-runs.ts`**

```ts
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRuns, theses, type AgentRun } from "@/lib/db/schema";
import type { AgentRunStatus, AgentRunTrigger } from "@/schemas/agent";

export async function createAgentRun(thesisId: string, trigger: AgentRunTrigger): Promise<AgentRun> {
  const [row] = await db.insert(agentRuns).values({ thesisId, trigger, status: "queued" }).returning();
  return row;
}

export async function markRunning(runId: string): Promise<void> {
  await db.update(agentRuns).set({ status: "running", startedAt: new Date() }).where(eq(agentRuns.id, runId));
}

export async function finishRun(
  runId: string,
  status: Extract<AgentRunStatus, "complete" | "partial" | "failed">,
  opts: { error?: string } = {},
): Promise<void> {
  await db
    .update(agentRuns)
    .set({ status, completedAt: new Date(), error: opts.error ?? null })
    .where(eq(agentRuns.id, runId));
}

export async function incrementRunTotals(
  runId: string,
  totals: { inputTokens: number; outputTokens: number; iterations?: number; evidence?: number },
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      inputTokens: sql`${agentRuns.inputTokens} + ${totals.inputTokens}`,
      outputTokens: sql`${agentRuns.outputTokens} + ${totals.outputTokens}`,
      iterationsUsed: sql`${agentRuns.iterationsUsed} + ${totals.iterations ?? 0}`,
      evidenceCollected: sql`${agentRuns.evidenceCollected} + ${totals.evidence ?? 0}`,
    })
    .where(eq(agentRuns.id, runId));
}

export async function getAgentRunForUser(userId: string, runId: string): Promise<AgentRun | null> {
  const [row] = await db
    .select({ run: agentRuns })
    .from(agentRuns)
    .innerJoin(theses, eq(theses.id, agentRuns.thesisId))
    .where(and(eq(agentRuns.id, runId), eq(theses.userId, userId)))
    .limit(1);
  return row?.run ?? null;
}
```

- [ ] **Step 3: Implement `lib/db/repositories/agent-run-iterations.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRunIterations, type AgentRunIteration } from "@/lib/db/schema";

export async function appendIteration(input: {
  agentRunId: string;
  iterationNumber: number;
  requestMessages: unknown;
  responseContent: unknown;
  toolCalls: unknown;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}): Promise<void> {
  await db.insert(agentRunIterations).values(input);
}

export async function listIterations(runId: string): Promise<AgentRunIteration[]> {
  return db
    .select()
    .from(agentRunIterations)
    .where(eq(agentRunIterations.agentRunId, runId))
    .orderBy(agentRunIterations.iterationNumber);
}
```

- [ ] **Step 4: Implement `lib/db/repositories/evidence.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { evidence, type Evidence } from "@/lib/db/schema";

export async function createEvidence(input: {
  agentRunId: string;
  sourceId: string;
  extractedText: string;
  claimIndices: number[];
  agentReasoning: string | null;
}): Promise<Evidence> {
  const [row] = await db.insert(evidence).values(input).returning();
  return row;
}

export async function listEvidenceForRun(runId: string): Promise<Evidence[]> {
  return db.select().from(evidence).where(eq(evidence.agentRunId, runId)).orderBy(evidence.createdAt);
}
```

- [ ] **Step 5: Typecheck + lint.** Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/db/repositories/sources.ts lib/db/repositories/agent-runs.ts lib/db/repositories/agent-run-iterations.ts lib/db/repositories/evidence.ts
git commit -m "feat: add sources, agent-runs, iterations, and evidence repositories"
```

---

### Task 11: Prompts

**Files:** Create `lib/ai/prompts/researcher.ts`. (No test — content, not logic.)

- [ ] **Step 1: Implement**

```ts
export const systemPrompt = `You are a research agent for an investment-thesis tracker. Your job is to GATHER evidence relevant to a thesis and its claims — not to judge whether the thesis is right. A separate evaluator does that.

Tools:
- web_search(query, limit?) — find candidate pages.
- web_fetch(url) — read an allow-listed page as markdown. Only reputable news, investor-relations, and SEC/EDGAR domains are allowed; others are refused, so prefer those sources.
- edgar(ticker, formType?) — list a company's recent SEC filings, then web_fetch a filing url to read it.
- return_result(evidence) — call once when done, with the evidence you gathered.

How to work:
- Search and read across a few independent, reputable sources. Skip URLs already in the "Already seen" list.
- For each genuinely relevant finding, capture the specific passage as extracted_text and tag which claim numbers it bears on (claim_indices, zero-based).
- Be efficient: a handful of well-chosen sources beats exhaustive browsing. When you have enough, call return_result.
- If you cannot find relevant evidence, call return_result with an empty list. Do not invent sources.`;

export function buildResearchTask(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { statement: string }[],
  seenSourceUrls: string[],
): string {
  const claimList = claims.map((c, i) => `${i}. ${c.statement}`).join("\n");
  const seen = seenSourceUrls.length ? seenSourceUrls.join("\n") : "(none yet)";
  return `Thesis: ${thesis.title}
Ticker: ${thesis.ticker} | Position: ${thesis.positionDirection} | Horizon: ${thesis.timeHorizon}

Claims (zero-based — use these indices in claim_indices):
${claimList}

Already seen sources (skip these):
${seen}

Find recent evidence bearing on these claims, then call return_result.`;
}
```

- [ ] **Step 2: Typecheck; commit** (after approval)
```bash
git add lib/ai/prompts/researcher.ts
git commit -m "feat: add researcher system prompt and task template"
```

---

### Task 12: Fixtures + Anthropic client wrapper (TDD the fixture layer)

**Files:** Create `lib/ai/fixtures.ts`, `lib/ai/fixtures.test.ts`, `lib/ai/client.ts`.

- [ ] **Step 1: Write failing test `lib/ai/fixtures.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixtureReader } from "./fixtures";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-"));
  mkdirSync(join(dir, "happy"), { recursive: true });
  writeFileSync(join(dir, "happy", "messages.json"), JSON.stringify([{ id: "m0" }, { id: "m1" }]));
  writeFileSync(join(dir, "happy", "tools.json"), JSON.stringify([{ ok: true, output: { results: [] } }]));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("FixtureReader", () => {
  it("replays messages in order", () => {
    const r = new FixtureReader(dir, "happy");
    expect(r.nextMessage()).toEqual({ id: "m0" });
    expect(r.nextMessage()).toEqual({ id: "m1" });
  });
  it("replays tool results in order", () => {
    const r = new FixtureReader(dir, "happy");
    expect(r.nextToolResult()).toEqual({ ok: true, output: { results: [] } });
  });
  it("throws a clear error when a fixture runs out", () => {
    const r = new FixtureReader(dir, "happy");
    r.nextMessage();
    r.nextMessage();
    expect(() => r.nextMessage()).toThrow(/exhausted/i);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/ai/fixtures.ts`**

```ts
import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const FIXTURE_ROOT = join(process.cwd(), "__fixtures__", "agent-runs");

export class FixtureReader {
  private messages: unknown[];
  private toolResults: unknown[];
  private mIdx = 0;
  private tIdx = 0;

  constructor(root: string, scenario: string) {
    const dir = join(root, scenario);
    const msgPath = join(dir, "messages.json");
    const toolPath = join(dir, "tools.json");
    if (!existsSync(msgPath)) throw new Error(`Fixture scenario not found: ${scenario} (${msgPath})`);
    this.messages = JSON.parse(readFileSync(msgPath, "utf8")) as unknown[];
    this.toolResults = existsSync(toolPath) ? (JSON.parse(readFileSync(toolPath, "utf8")) as unknown[]) : [];
  }

  nextMessage(): unknown {
    if (this.mIdx >= this.messages.length) throw new Error(`Fixture messages exhausted (scenario)`);
    return this.messages[this.mIdx++];
  }

  nextToolResult(): unknown {
    if (this.tIdx >= this.toolResults.length) throw new Error(`Fixture tool results exhausted (scenario)`);
    return this.toolResults[this.tIdx++];
  }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement `lib/ai/client.ts`** (no separate unit test — exercised by the loop tests in Task 13 via injection)

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@/lib/ai/tools/types";

export const CURRENT_MODEL = "claude-opus-4-8";

export type AnthropicLike = {
  createMessage(params: {
    system: string;
    tools: { name: string; description: string; input_schema: unknown }[];
    messages: Anthropic.MessageParam[];
  }): Promise<Anthropic.Message>;
};

export function createAnthropicClient(apiKey: string): AnthropicLike {
  const sdk = new Anthropic({ apiKey });
  return {
    async createMessage({ system, tools, messages }) {
      return sdk.messages.create({
        model: CURRENT_MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: tools.map((t, i) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
        })),
        messages,
      });
    },
  };
}

// Build the Anthropic tool-definition payload from our Tool registry. Zod → JSON
// schema via zod's toJSONSchema (zod v4). Kept here so the loop stays clean.
import { z } from "zod";
export function toAnthropicTools(tools: Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.inputSchema) as unknown,
  }));
}
```

> Implementer note: confirm `z.toJSONSchema` is available in the installed Zod v4 (it is in zod ≥ 3.23/4.x as `z.toJSONSchema`). If the exact export differs, use the equivalent JSON-schema helper; the goal is a plain JSON schema object for each tool's `input_schema`. The `thinking`/`output_config`/`cache_control` fields are current Opus 4.8 API (from the claude-api skill) — if the installed SDK's types lag, cast the params object to satisfy TS rather than removing fields.

- [ ] **Step 6: Typecheck.** Run: `npm run typecheck` → clean (cast where SDK types lag, with a comment).

- [ ] **Step 7: Commit** (after approval)
```bash
git add lib/ai/fixtures.ts lib/ai/fixtures.test.ts lib/ai/client.ts
git commit -m "feat: add fixture reader and Anthropic client wrapper"
```

---

### Task 13: The researcher loop (TDD with injected fakes)

**Files:** Create `lib/ai/agents/researcher.ts`, `lib/ai/agents/researcher.test.ts`.

The loop is pure orchestration over injected dependencies: an `AnthropicLike` client, the tool registry + a `ToolContext`, and a `persist` interface. This makes it fully unit-testable with fakes (mirrors `handleUserEvent`).

- [ ] **Step 1: Write failing test `lib/ai/agents/researcher.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { runResearcher, type ResearcherDeps } from "./researcher";

// Minimal Anthropic-message shapes the loop reads.
function textMsg(): any {
  return { content: [{ type: "text", text: "thinking..." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
}
function toolMsg(name: string, input: unknown): any {
  return {
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}
function returnResultMsg(evidence: unknown[]): any {
  return toolMsg("return_result", { evidence });
}

function deps(responses: any[]): ResearcherDeps {
  const persist = {
    appendIteration: vi.fn().mockResolvedValue(undefined),
    persistEvidence: vi.fn().mockResolvedValue(undefined),
  };
  let i = 0;
  return {
    client: { createMessage: vi.fn().mockImplementation(async () => responses[i++]) },
    toolContext: { search: { search: vi.fn() }, fetcher: vi.fn(), edgarClient: vi.fn(), useFixtures: false },
    persist,
    maxIterations: 12,
    maxTokens: 100_000,
  };
}

const thesis = { title: "T", ticker: "NVDA", positionDirection: "long", timeHorizon: "months" };
const claims = [{ statement: "Revenue grows" }];

describe("runResearcher", () => {
  it("completes when the agent calls return_result and persists evidence", async () => {
    const d = deps([
      returnResultMsg([
        { source_url: "https://reuters.com/a", title: "T", snippet: "s", claim_indices: [0], extracted_text: "txt" },
      ]),
    ]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("complete");
    expect(d.persist.persistEvidence).toHaveBeenCalledTimes(1);
    expect(d.persist.appendIteration).toHaveBeenCalled();
  });

  it("completes with no evidence on a bare end_turn", async () => {
    const d = deps([textMsg()]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("complete");
    expect(d.persist.persistEvidence).not.toHaveBeenCalled();
  });

  it("stops as partial when iteration cap is hit (agent keeps calling tools)", async () => {
    const many = Array.from({ length: 13 }, () => toolMsg("web_search", { query: "x" }));
    const d = deps(many);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("partial");
    expect(d.client.createMessage).toHaveBeenCalledTimes(12);
  });

  it("fails on an unexpected stop_reason", async () => {
    const d = deps([{ content: [], stop_reason: "max_tokens", usage: { input_tokens: 1, output_tokens: 1 } }]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/ai/agents/researcher.ts`**

```ts
import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { toAnthropicTools } from "@/lib/ai/client";
import { TOOLS, executeToolCallSafely } from "@/lib/ai/tools/registry";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { ReturnResultSchema, type EvidenceItem } from "@/schemas/agent";
import { systemPrompt, buildResearchTask } from "@/lib/ai/prompts/researcher";

export type PersistEvidenceInput = { item: EvidenceItem; source?: unknown };
export interface ResearcherPersist {
  appendIteration(it: {
    iterationNumber: number;
    requestMessages: unknown;
    responseContent: unknown;
    toolCalls: unknown;
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  }): Promise<void>;
  persistEvidence(item: EvidenceItem): Promise<void>;
}

export type ResearcherDeps = {
  client: AnthropicLike;
  toolContext: ToolContext;
  persist: ResearcherPersist;
  maxIterations: number;
  maxTokens: number;
  // Override tool execution (fixture replay swaps this for recorded results).
  // Defaults to executeToolCallSafely (real, schema-validated execution).
  toolRunner?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

export type ResearcherResult = {
  status: "complete" | "partial" | "failed";
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  evidenceCount: number;
  reason?: string;
};

type AnyMessage = Anthropic.Message;

export async function runResearcher(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { statement: string }[],
  seenSourceUrls: string[],
  deps: ResearcherDeps,
  _scenario: string,
): Promise<ResearcherResult> {
  const tools = toAnthropicTools(TOOLS) as { name: string; description: string; input_schema: unknown }[];
  const runTool = deps.toolRunner ?? executeToolCallSafely;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildResearchTask(thesis, claims, seenSourceUrls) },
  ];

  let iterations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let evidenceCount = 0;

  while (iterations < deps.maxIterations && inputTokens + outputTokens < deps.maxTokens) {
    const started = Date.now();
    const response = (await deps.client.createMessage({ system: systemPrompt, tools, messages })) as AnyMessage;
    const it = response.usage?.input_tokens ?? 0;
    const ot = response.usage?.output_tokens ?? 0;
    inputTokens += it;
    outputTokens += ot;

    const content = response.content ?? [];
    const toolUses = content.filter((b): b is Anthropic.ToolUseBlock => (b as { type?: string }).type === "tool_use");

    // return_result = completion signal.
    const finalCall = toolUses.find((b) => b.name === "return_result");
    if (finalCall) {
      const parsed = ReturnResultSchema.safeParse(finalCall.input);
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: [{ tool_name: "return_result", input: finalCall.input }],
        stopReason: response.stop_reason ?? null,
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      if (parsed.success) {
        for (const item of parsed.data.evidence) {
          await deps.persist.persistEvidence(item);
          evidenceCount++;
        }
      }
      return { status: "complete", iterations: iterations + 1, inputTokens, outputTokens, evidenceCount };
    }

    if (response.stop_reason === "tool_use" && toolUses.length > 0) {
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      const toolCallLog: unknown[] = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input, deps.toolContext);
        toolCallLog.push({ tool_name: tu.name, input: tu.input, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.error });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result.ok ? result.output : { error: result.error }),
          is_error: !result.ok,
        });
      }
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: toolCallLog,
        stopReason: response.stop_reason ?? null,
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: toolResultBlocks });
      iterations++;
      continue;
    }

    if (response.stop_reason === "end_turn") {
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: null,
        stopReason: "end_turn",
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      return { status: "complete", iterations: iterations + 1, inputTokens, outputTokens, evidenceCount };
    }

    // Unexpected stop_reason (max_tokens, refusal, etc.)
    await deps.persist.appendIteration({
      iterationNumber: iterations,
      requestMessages: messages,
      responseContent: content,
      toolCalls: null,
      stopReason: response.stop_reason ?? null,
      inputTokens: it,
      outputTokens: ot,
      durationMs: Date.now() - started,
    });
    return {
      status: "failed",
      iterations: iterations + 1,
      inputTokens,
      outputTokens,
      evidenceCount,
      reason: `Unexpected stop_reason: ${response.stop_reason}`,
    };
  }

  return { status: "partial", iterations, inputTokens, outputTokens, evidenceCount, reason: "budget_or_iteration_cap" };
}
```

> Implementer note: the test's fake messages use loose `any` shapes; the production types come from the SDK. If SDK block-type narrowing differs, adjust the `.filter` guard but keep the behavior the tests assert (detect `return_result`, execute other tools, handle end_turn / unexpected stop). The persist interface intentionally takes the raw `EvidenceItem`; mapping it to `sources`+`evidence` rows happens in the Inngest function's `persist` implementation (Task 15), where the source from `web_fetch` results is available.

- [ ] **Step 4: Run → PASS** (`npx vitest run lib/ai/agents/researcher.test.ts`).

- [ ] **Step 5: Full sweep.** Run: `npx vitest run && npm run typecheck && npm run lint` → all clean.

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/ai/agents/researcher.ts lib/ai/agents/researcher.test.ts
git commit -m "feat: add hand-written researcher loop with explicit stop conditions"
```

---

### Task 14: Seed fixture scenarios

**Files:** Create `__fixtures__/agent-runs/nvda-happy-path/{messages.json,tools.json}` and `__fixtures__/agent-runs/no-evidence/{messages.json,tools.json}`.

Hand-author minimal-but-realistic fixtures (we author rather than record, to avoid spending tokens before the engine is wired; a record command comes from running the real path later). Each `messages.json` is an ordered array of Anthropic-message-shaped objects the client wrapper returns per iteration.

- [ ] **Step 1: `nvda-happy-path/messages.json`** — three iterations: search → fetch → return_result.

```json
[
  {
    "content": [
      { "type": "thinking", "thinking": "The thesis is about NVDA data-center revenue. I'll search recent coverage." },
      { "type": "tool_use", "id": "tu_search", "name": "web_search", "input": { "query": "NVDA data center revenue Q3 2026", "limit": 5 } }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1200, "output_tokens": 120 }
  },
  {
    "content": [
      { "type": "thinking", "thinking": "Reuters looks authoritative. I'll read it." },
      { "type": "tool_use", "id": "tu_fetch", "name": "web_fetch", "input": { "url": "https://www.reuters.com/technology/nvidia-data-center-q3" } }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1500, "output_tokens": 90 }
  },
  {
    "content": [
      { "type": "thinking", "thinking": "I have a concrete figure tied to claim 0. Returning." },
      { "type": "tool_use", "id": "tu_return", "name": "return_result", "input": { "evidence": [
        { "source_url": "https://www.reuters.com/technology/nvidia-data-center-q3", "title": "Nvidia data-center revenue jumps", "snippet": "Data-center revenue rose 41% YoY", "claim_indices": [0], "extracted_text": "Nvidia reported data-center revenue rose 41% year over year in Q3." }
      ] } }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1800, "output_tokens": 200 }
  }
]
```

- [ ] **Step 2: `nvda-happy-path/tools.json`** — the tool results fed back, in call order (search result, then fetch result):

```json
[
  { "results": [ { "title": "Nvidia data-center revenue jumps", "url": "https://www.reuters.com/technology/nvidia-data-center-q3", "snippet": "Data-center revenue rose 41% YoY" } ] },
  { "url": "https://www.reuters.com/technology/nvidia-data-center-q3", "title": "Nvidia data-center revenue jumps", "markdown": "# Nvidia\nData-center revenue rose 41% year over year in Q3.", "source": { "sourceUrl": "https://www.reuters.com/technology/nvidia-data-center-q3", "title": "Nvidia data-center revenue jumps", "domain": "reuters.com", "rawContentHash": "deadbeef", "contentExcerpt": "# Nvidia\nData-center revenue rose 41% year over year in Q3." } }
]
```

- [ ] **Step 3: `no-evidence/messages.json`** — one iteration: return_result with empty evidence.

```json
[
  {
    "content": [
      { "type": "thinking", "thinking": "I searched but found nothing reputable bearing on these claims." },
      { "type": "tool_use", "id": "tu_return", "name": "return_result", "input": { "evidence": [] } }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1100, "output_tokens": 60 }
  }
]
```

- [ ] **Step 4: `no-evidence/tools.json`** — empty array `[]`.

- [ ] **Step 5: Commit** (after approval)
```bash
git add __fixtures__/agent-runs/
git commit -m "test: add nvda-happy-path and no-evidence agent fixtures"
```

> The fixture client (used when `USE_AI_FIXTURES=1`) returns `messages[i]` per iteration; the fixture tool layer returns `tools[j]` per tool call. The loop tests in Task 13 already cover loop behavior with inline fakes — these fixtures drive the end-to-end run in Task 17.

---

### Task 15: Inngest client, route, and run-agent function + ToolContext builder

**Files:** Create `lib/inngest/client.ts`, `lib/inngest/functions/run-agent.ts`, `app/api/inngest/route.ts`, `lib/ai/tool-context.ts`.

- [ ] **Step 1: `lib/inngest/client.ts`**

```ts
import { Inngest } from "inngest";

export type AgentRunRequested = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string };
};

export const inngest = new Inngest({ id: "thesis-tracker" });
```

- [ ] **Step 2: `lib/ai/tool-context.ts`** — builds the real `ToolContext` (Brave provider, fetcher, EDGAR client), or a fixture-backed one.

```ts
import "server-only";
import { createBraveProvider } from "@/lib/ai/tools/providers/brave";
import type { ToolContext } from "@/lib/ai/tools/types";
import { serverEnv } from "@/lib/env.server";

const EDGAR_TICKERS = "https://www.sec.gov/files/company_tickers.json";

async function realFetcher(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT } });
  return { status: res.status, html: await res.text(), finalUrl: res.url };
}

async function realEdgar(ticker: string, formType?: string) {
  const res = await fetch(EDGAR_TICKERS, { headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT } });
  if (!res.ok) throw new Error(`EDGAR lookup failed: ${res.status}`);
  const map = (await res.json()) as Record<string, { ticker: string; cik_str: number }>;
  const entry = Object.values(map).find((e) => e.ticker.toUpperCase() === ticker.toUpperCase());
  if (!entry) throw new Error(`Unknown ticker: ${ticker}`);
  const cik = String(entry.cik_str).padStart(10, "0");
  const subs = (await (await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT },
  })).json()) as { filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] } } };
  const r = subs.filings.recent;
  const out: { form: string; filedAt: string; url: string }[] = [];
  for (let i = 0; i < r.form.length && out.length < 10; i++) {
    if (formType && r.form[i] !== formType) continue;
    const acc = r.accessionNumber[i].replace(/-/g, "");
    out.push({
      form: r.form[i],
      filedAt: r.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${acc}/${r.primaryDocument[i]}`,
    });
  }
  return out;
}

export function buildToolContext(scenario?: string): ToolContext {
  const useFixtures = serverEnv.USE_AI_FIXTURES;
  if (useFixtures) {
    // Fixture-backed context: tools are short-circuited by the loop's fixture path;
    // provide throwing stubs so an accidental real call is loud, not silent.
    const fail = () => {
      throw new Error("Real tool I/O attempted while USE_AI_FIXTURES=1");
    };
    return {
      search: { search: async () => fail() },
      fetcher: async () => fail(),
      edgarClient: async () => fail(),
      useFixtures: true,
      scenario,
    };
  }
  return {
    search: createBraveProvider(serverEnv.BRAVE_API_KEY!),
    fetcher: realFetcher,
    edgarClient: realEdgar,
    useFixtures: false,
    scenario,
  };
}
```

> Implementer note: when `USE_AI_FIXTURES=1`, the run-agent function uses the **fixture client** (returns recorded messages) and a **fixture tool runner** that returns recorded tool results from `tools.json` instead of calling `executeToolCallSafely` against the network. Implement that fixture path in the loop wiring (Step 3) by swapping the `client` and intercepting tool execution when `toolContext.useFixtures` — using the `FixtureReader`. Keep the offline guarantee: no network when fixtures are on.

- [ ] **Step 3: `lib/inngest/functions/run-agent.ts`** — drives the loop, one `step.run` per iteration via the loop's iteration callback, mapping evidence to `sources` + `evidence` rows.

```ts
import { inngest, type AgentRunRequested } from "@/lib/inngest/client";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listRecentSourceUrlsForThesis, findOrCreateSource } from "@/lib/db/repositories/sources";
import { markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { createEvidence } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import { createAnthropicClient } from "@/lib/ai/client";
import { buildToolContext } from "@/lib/ai/tool-context";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { serverEnv } from "@/lib/env.server";
import { hostnameOf, sha256 } from "@/lib/ai/url";

export const runAgent = inngest.createFunction(
  { id: "run-agent", retries: 2 },
  { event: "agent.run-requested" },
  async ({ event, step }: { event: AgentRunRequested; step: any }) => {
    const { agentRunId, thesisId, userId, scenario } = event.data;

    const thesis = await step.run("load-thesis", () => getThesisForUser(userId, thesisId));
    if (!thesis) {
      await finishRun(agentRunId, "failed", { error: "Thesis not found or not owned" });
      return { status: "failed" };
    }
    const seen = await step.run("load-seen", () => listRecentSourceUrlsForThesis(thesisId, 90));
    await step.run("mark-running", () => markRunning(agentRunId));

    // Fixture vs real client.
    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const reader = useFixtures ? new FixtureReader(FIXTURE_ROOT, scenario ?? "nvda-happy-path") : null;
    const client = useFixtures
      ? { createMessage: async () => reader!.nextMessage() as any }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
    const toolContext = buildToolContext(scenario);
    if (useFixtures) {
      // Replace tool execution with fixture playback.
      toolContext.search = { search: async () => (reader!.nextToolResult() as { results: any[] }).results };
      toolContext.fetcher = async () => {
        throw new Error("fixture fetcher unused"); // web_fetch result comes via the registry path below
      };
    }

    // persist maps EvidenceItem -> sources + evidence; each iteration is a durable step.
    let iterationStepCounter = 0;
    const persist: ResearcherPersist = {
      appendIteration: (it) =>
        step.run(`iteration-${iterationStepCounter++}`, async () => {
          await appendIteration({ agentRunId, ...it });
        }),
      persistEvidence: (item) =>
        step.run(`evidence-${item.source_url}`, async () => {
          const source = await findOrCreateSource({
            url: item.source_url,
            domain: hostnameOf(item.source_url),
            title: item.title,
            rawContentHash: sha256(item.extracted_text),
            contentExcerpt: item.snippet,
          });
          await createEvidence({
            agentRunId,
            sourceId: source.id,
            extractedText: item.extracted_text,
            claimIndices: item.claim_indices,
            agentReasoning: null,
          });
        }),
    };

    const result = await runResearcher(
      thesis,
      thesis.claims,
      seen,
      { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000 },
      scenario ?? "nvda-happy-path",
    );

    await incrementRunTotals(agentRunId, {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      iterations: result.iterations,
      evidence: result.evidenceCount,
    });
    await finishRun(agentRunId, result.status === "failed" ? "failed" : result.status === "partial" ? "partial" : "complete", {
      error: result.reason,
    });
    return { status: result.status };
  },
);
```

> Implementer note: the fixture wiring above short-circuits `web_search`; for `web_fetch`/`edgar` under fixtures, route their results from `tools.json` too (extend the `tools.json` ordering to include every tool call in sequence and have a single `nextToolResult()` feed `executeToolCallSafely`'s place). The cleanest implementation: when `useFixtures`, the loop's tool execution returns `reader.nextToolResult()` for ANY tool call instead of calling `executeToolCallSafely`. Adjust the loop to accept an optional `toolRunner` override in `ResearcherDeps` (defaulting to `executeToolCallSafely`); the Inngest function passes a fixture `toolRunner` that pulls from the reader. Add this small seam to Task 13's `ResearcherDeps` if not already present, with a test. **This is the one cross-task wiring detail to get right — verify the offline run in Task 17 exercises it.**

- [ ] **Step 4: `app/api/inngest/route.ts`**

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAgent } from "@/lib/inngest/functions/run-agent";

// Allow a long single Opus iteration within Vercel Hobby's ceiling.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [runAgent] });
```

- [ ] **Step 5: Typecheck + lint.** Run: `npm run typecheck && npm run lint` → clean. (Cast Inngest `step`/`event` types as shown if the generic event-schema types are heavy; prefer a typed client schema if quick.)

- [ ] **Step 6: Commit** (after approval)
```bash
git add lib/inngest/ lib/ai/tool-context.ts "app/api/inngest/route.ts"
git commit -m "feat: add Inngest client, run-agent function, serve route, and tool context"
```

---

### Task 16: Env validation, `.env.example`, and `triggerAgentRun` action

**Files:** Modify `lib/env.server.ts`, `.env.example`; create `app/(app)/theses/agent-actions.ts`.

- [ ] **Step 1: Extend `lib/env.server.ts`**

```ts
import "server-only";
import { z } from "zod";

const useFixtures = process.env.USE_AI_FIXTURES === "1";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),
  // AI/agent — required only when NOT running on fixtures.
  ANTHROPIC_API_KEY: useFixtures ? z.string().optional() : z.string().min(1),
  BRAVE_API_KEY: useFixtures ? z.string().optional() : z.string().min(1),
  EDGAR_USER_AGENT: z.string().min(1).default("ThesisTracker (contact@example.com)"),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  USE_AI_FIXTURES: z.boolean().default(false),
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  EDGAR_USER_AGENT: process.env.EDGAR_USER_AGENT,
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  USE_AI_FIXTURES: useFixtures,
});
```

- [ ] **Step 2: Append to `.env.example`**

```
# ---- AI / agent (Phase 3) ----
# Not required when USE_AI_FIXTURES=1 (offline fixtures).
ANTHROPIC_API_KEY=
BRAVE_API_KEY=
# SEC requires a descriptive User-Agent (your app + contact email).
EDGAR_USER_AGENT=ThesisTracker (you@example.com)
# Inngest (prod). Locally the dev server needs neither.
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
# Set to 1 in dev to replay agent runs from __fixtures__ (no network, no cost).
USE_AI_FIXTURES=1
```

- [ ] **Step 3: Implement `app/(app)/theses/agent-actions.ts`**

```ts
"use server";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { createAgentRun } from "@/lib/db/repositories/agent-runs";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/(app)/theses/actions";

export async function triggerAgentRun(thesisId: string): Promise<ActionResult<{ agentRunId: string }>> {
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) return { ok: false, error: "Thesis not found" };
  const run = await createAgentRun(thesisId, "manual");
  await inngest.send({
    name: "agent.run-requested",
    data: { agentRunId: run.id, thesisId, userId, scenario: "nvda-happy-path" },
  });
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: { agentRunId: run.id } };
}
```

> `scenario` is passed so fixture runs are deterministic in dev; in real runs it's ignored by the real client/tools. (3b will drop it for real triggers.)

- [ ] **Step 4: Typecheck + lint.** Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit** (after approval)
```bash
git add lib/env.server.ts .env.example "app/(app)/theses/agent-actions.ts"
git commit -m "feat: add agent env vars and triggerAgentRun server action"
```

---

### Task 17: End-to-end fixtured verification

**Files:** Create a throwaway dev harness `scripts/run-agent-fixture.ts` (committed — useful later), run it, inspect rows.

- [ ] **Step 1: Write `scripts/run-agent-fixture.ts`**

A minimal script that, with `USE_AI_FIXTURES=1`, builds the fixture client + reader + tool context and calls `runResearcher` directly against a real (dev) DB agent_run row — bypassing Inngest — to confirm the loop + persistence + repos work offline end to end. (Inngest's own wiring is verified by `npx inngest-cli dev` separately in Step 3.)

```ts
import "dotenv/config";
import { db } from "@/lib/db";
import { theses, claims as claimsTable } from "@/lib/db/schema";
import { createAgentRun, markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { findOrCreateSource } from "@/lib/db/repositories/sources";
import { createEvidence } from "@/lib/db/repositories/evidence";
import { listIterations } from "@/lib/db/repositories/agent-run-iterations";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { runResearcher } from "@/lib/ai/agents/researcher";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { hostnameOf, sha256 } from "@/lib/ai/url";
import { eq } from "drizzle-orm";

async function main() {
  const scenario = process.argv[2] ?? "nvda-happy-path";
  const [thesis] = await db.select().from(theses).limit(1);
  if (!thesis) throw new Error("Seed a thesis first (create one in the app).");
  const cs = await db.select().from(claimsTable).where(eq(claimsTable.thesisId, thesis.id));
  const run = await createAgentRun(thesis.id, "manual");
  await markRunning(run.id);

  const reader = new FixtureReader(FIXTURE_ROOT, scenario);
  const client = { createMessage: async () => reader.nextMessage() as never };
  const toolContext = {
    search: { search: async () => (reader.nextToolResult() as { results: never[] }).results },
    fetcher: async () => ({ status: 200, html: "", finalUrl: "" }),
    edgarClient: async () => [],
    useFixtures: true,
    scenario,
  };
  let n = 0;
  const result = await runResearcher(
    { title: thesis.title, ticker: thesis.ticker, positionDirection: thesis.positionDirection, timeHorizon: thesis.timeHorizon },
    cs.map((c) => ({ statement: c.statement })),
    [],
    {
      client,
      toolContext,
      persist: {
        appendIteration: (it) => appendIteration({ agentRunId: run.id, ...it }),
        persistEvidence: async (item) => {
          const src = await findOrCreateSource({ url: item.source_url, domain: hostnameOf(item.source_url), title: item.title, rawContentHash: sha256(item.extracted_text), contentExcerpt: item.snippet });
          await createEvidence({ agentRunId: run.id, sourceId: src.id, extractedText: item.extracted_text, claimIndices: item.claim_indices, agentReasoning: null });
        },
      },
      maxIterations: 12,
      maxTokens: 100_000,
    },
    scenario,
  );
  await incrementRunTotals(run.id, { inputTokens: result.inputTokens, outputTokens: result.outputTokens, iterations: result.iterations, evidence: result.evidenceCount });
  await finishRun(run.id, result.status === "failed" ? "failed" : result.status, { error: result.reason });

  const its = await listIterations(run.id);
  const ev = await listEvidenceForRun(run.id);
  console.log(JSON.stringify({ run: run.id, status: result.status, iterations: its.length, evidence: ev.length }, null, 2));
}

main().then(() => process.exit(0));
```

> Note: this harness uses the `toolRunner` fixture seam differently than the Inngest function; if `runResearcher` was given the optional `toolRunner` override (Task 15 note), pass a `toolRunner: () => reader.nextToolResult()` here instead of stubbing `toolContext` I/O. Keep one consistent fixture-replay mechanism between this harness and `run-agent.ts`.

- [ ] **Step 2: Run the happy-path scenario** (needs `USE_AI_FIXTURES=1` and a thesis in the dev DB)

Run:
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22
USE_AI_FIXTURES=1 npx tsx scripts/run-agent-fixture.ts nvda-happy-path
```
Expected JSON: `status: "complete"`, `iterations: 3`, `evidence: 1`. (Install `tsx` if absent: `npm i -D tsx`.)

- [ ] **Step 3: Run the no-evidence scenario**

Run: `USE_AI_FIXTURES=1 npx tsx scripts/run-agent-fixture.ts no-evidence`
Expected: `status: "complete"`, `iterations: 1`, `evidence: 0`.

- [ ] **Step 4: Verify the Inngest path compiles + registers**

Run (two terminals): `npm run dev`, then `npx inngest-cli@latest dev` — confirm the `run-agent` function appears in the Inngest dev dashboard with no registration errors. (Full event-triggered run via the dashboard is exercised more in Phase 3b when the UI sends it.)

- [ ] **Step 5: Full sweep.** Run: `npm test && npm run typecheck && npm run lint && npm run build` → all green.

- [ ] **Step 6: Commit** (after approval)
```bash
git add scripts/run-agent-fixture.ts package.json package-lock.json
git commit -m "test: add offline fixtured agent-run harness and verify end to end"
```

---

## Self-review notes (author)

- **Spec coverage:** schema+pgvector (T2), enum tuples+drift test (T3), helpers (T4), AI schemas (T5), tools incl. Brave + allow-list + truncation + return_result + registry (T6–T9), repos (T10), prompts (T11), client+fixtures (T12), the hand-written loop with all stop conditions (T13), the two seeded scenarios (T14), Inngest client/function/route + tool context + EDGAR client + offline guarantee (T15), env + `.env.example` + `triggerAgentRun` (T16), end-to-end fixtured verification (T17). Dedup (URL/content hash + seen-list) is in T4/T10/T15; semantic dedup deferred (column created nullable in T2, unpopulated). Cost/free-tier handled via fixtures + caching + 8KB truncation.
- **Deferred to 3b:** all UI (run card, polling, evidence stream, trace view). `triggerAgentRun` exists but nothing calls it from the UI yet.
- **The one cross-task risk:** the fixture **tool-replay seam** (T13 `ResearcherDeps.toolRunner` override vs stubbing `toolContext` I/O). Pick ONE mechanism and use it consistently in `run-agent.ts` (T15) and the harness (T17). Recommended: add an optional `toolRunner?: (name, input, ctx) => Promise<ToolResult>` to `ResearcherDeps`, default `executeToolCallSafely`; the fixture path passes a runner that returns `reader.nextToolResult()` wrapped as `{ ok: true, output }`. Add a one-line test for the override in T13.
- **Verify-at-execution:** `z.toJSONSchema` export name in the installed Zod; current `@anthropic-ai/sdk` param/type names for `thinking`/`output_config`/`cache_control` (cast if SDK types lag — values are correct per the claude-api skill); Brave response JSON shape (confirm `web.results[].description`); Inngest `serve`/`createFunction` generics (cast `step`/`event` if heavy). Confirm Brave free-tier quota at signup.
