import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
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
