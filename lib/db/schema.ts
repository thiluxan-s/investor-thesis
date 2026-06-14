import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Enum values mirror schemas/thesis.ts — keep in sync.
export const positionDirection = pgEnum("position_direction", ["long", "short"]);
export const timeHorizon = pgEnum("time_horizon", ["weeks", "months", "6_to_12_months", "years"]);
export const thesisStatus = pgEnum("thesis_status", ["active", "paused", "closed"]);
export const claimCategory = pgEnum("claim_category", [
  "financial_performance",
  "product_traction",
  "competitive_position",
  "macro_environment",
  "execution",
  "valuation",
  "other",
]);

export const theses = pgTable(
  "theses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ticker: text("ticker").notNull(),
    positionDirection: positionDirection("position_direction").notNull(),
    timeHorizon: timeHorizon("time_horizon").notNull(),
    status: thesisStatus("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("theses_user_id_idx").on(t.userId),
    index("theses_user_status_idx").on(t.userId, t.status),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    statement: text("statement").notNull(),
    category: claimCategory("category").notNull(),
    currentHealthScore: numeric("current_health_score", { precision: 3, scale: 2 })
      .notNull()
      .default("0"),
    currentHealthUpdatedAt: timestamp("current_health_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("claims_thesis_id_idx").on(t.thesisId)],
);

export type Thesis = typeof theses.$inferSelect;
export type NewThesis = typeof theses.$inferInsert;
export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;

// Enum values mirror schemas/agent.ts — keep in sync.
export const agentRunStatus = pgEnum("agent_run_status", [
  "queued",
  "running",
  "complete",
  "partial",
  "failed",
]);
export const agentRunTrigger = pgEnum("agent_run_trigger", ["manual", "scheduled"]);

// Enum values mirror schemas/evidence.ts — keep in sync.
export const evidenceImpact = pgEnum("evidence_impact", ["strengthens", "neutral", "weakens"]);

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

export const claimEvidenceLinks = pgTable(
  "claim_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    impact: evidenceImpact("impact").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    reasoning: text("reasoning").notNull(),
    evaluatorPromptVersion: text("evaluator_prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("claim_evidence_links_pair_idx").on(t.claimId, t.evidenceId),
    index("claim_evidence_links_claim_id_idx").on(t.claimId),
  ],
);

export const thesisHealthSnapshots = pgTable(
  "thesis_health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    overallScore: numeric("overall_score", { precision: 3, scale: 2 }).notNull(),
    claimScores: jsonb("claim_scores").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("thesis_health_snapshots_run_idx").on(t.agentRunId),
    index("thesis_health_snapshots_thesis_recorded_idx").on(t.thesisId, t.recordedAt),
  ],
);

export type Source = typeof sources.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunIteration = typeof agentRunIterations.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type ClaimEvidenceLink = typeof claimEvidenceLinks.$inferSelect;
export type NewClaimEvidenceLink = typeof claimEvidenceLinks.$inferInsert;
export type ThesisHealthSnapshot = typeof thesisHealthSnapshots.$inferSelect;
export type NewThesisHealthSnapshot = typeof thesisHealthSnapshots.$inferInsert;
