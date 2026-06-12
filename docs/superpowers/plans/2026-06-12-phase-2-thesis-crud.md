# Phase 2 — Thesis & Claim CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create theses with 2–5 claims, view them in a flat-row list and a two-column detail page, edit title/status/notes and claims inline, and delete — pure user-side CRUD, no AI.

**Architecture:** Drizzle tables `theses` + `claims` (cascade from `users`). All DB access through `lib/db/repositories/`. Server Actions (`{ ok } | { error }` contract) own mutations and call repositories; Server Components read repositories directly. Cross-cutting Zod schemas in `schemas/` are the validation source of truth and are shared by client forms and actions. Claim-count invariants (min 2 / max 5) live in pure predicates consumed by the repository so they can't be bypassed.

**Tech Stack:** Next.js 16 App Router, React 19 (`useTransition`), TypeScript strict, Drizzle ORM (`neon-http` + `db.batch`), Neon Postgres, Clerk, Zod v4, Tailwind v4 + shadcn (classic Radix, new-york-v4), Vitest.

**Approval gate (CLAUDE.md):** Before EVERY `git add`/`git commit` step below, summarize the change, show the diff, and **wait for the user's explicit approval**. The commit steps are written as the intended commit — do not run them unprompted.

**Key constraints discovered:**
- `neon-http` has no `db.transaction()`. Use `db.batch([...])` for atomic multi-insert; generate the thesis `id` with `crypto.randomUUID()` so claims can reference it inside the same batch.
- No test DB exists. Tests follow the Phase 1 precedent (`lib/clerk/handle-user-event.test.ts`): pure unit tests, no DB. We TDD the infra-free logic only — Zod schemas + claim-count predicates. Repositories/actions/UI are verified by `typecheck` + manual happy/sad paths.
- Existing schema style uses explicit snake_case column names (e.g. `text("clerk_user_id")`). Match it.
- `radix-ui` (unified package) is already a dependency; new shadcn components import from it and should need no new Radix deps.

---

## File structure

**Create:**
- `schemas/thesis.ts` — Zod schemas + enum value tuples (client-safe, zod-only). Validation source of truth.
- `lib/theses/claim-invariants.ts` — pure `canAddClaim` / `canDeleteClaim` + `MIN_CLAIMS`/`MAX_CLAIMS`.
- `lib/theses/labels.ts` — enum → human-readable label maps (client-safe).
- `lib/auth/require-user.ts` — `requireUserId()` resolving Clerk → local `users.id`.
- `lib/db/repositories/theses.ts`, `lib/db/repositories/claims.ts`.
- `app/(app)/theses/actions.ts` — Server Actions.
- `app/(app)/theses/new/page.tsx` — wizard route.
- `app/(app)/theses/[thesisId]/page.tsx` — detail page.
- `components/theses/CategoryBadge.tsx`, `ThesisRow.tsx`, `ClaimForm.tsx`, `NewThesisWizard.tsx`, `ClaimList.tsx`, `StatusSelect.tsx`, `NotesEditor.tsx`, `DeleteThesisButton.tsx`.
- `components/ui/{select,textarea,badge,tooltip,alert-dialog}.tsx` — added via registry fetch.
- Test files: `schemas/thesis.test.ts`, `lib/theses/claim-invariants.test.ts`. (Tests must live where Vitest looks — see Task 1.)

**Modify:**
- `lib/db/schema.ts` — add enums + `theses` + `claims`.
- `app/(app)/theses/page.tsx` — real list + empty state.
- `vitest.config.ts` — include `schemas/**/*.test.ts` (currently only `lib/**`).
- `docs/DESIGN.md` — per-screen blocks + decisions log.

---

### Task 1: Let Vitest see `schemas/` tests

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Update the include glob**

Replace the file contents with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "schemas/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Verify config still loads**

Run: `npm test`
Expected: PASS — the existing `handle-user-event` suite still runs and passes (no new tests yet).

- [ ] **Step 3: Commit** (after approval)

```bash
git add vitest.config.ts
git commit -m "chore: include schemas dir in vitest test glob"
```

---

### Task 2: Validation schemas (TDD)

**Files:**
- Create: `schemas/thesis.ts`
- Test: `schemas/thesis.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// schemas/thesis.test.ts
import { describe, it, expect } from "vitest";
import {
  TickerSchema,
  ClaimInputSchema,
  CreateThesisSchema,
  UpdateThesisSchema,
} from "./thesis";

const validClaim = { statement: "Revenue grows over forty percent YoY.", category: "financial_performance" } as const;

function baseThesis() {
  return {
    title: "Long NVDA — data center",
    ticker: "nvda",
    positionDirection: "long",
    timeHorizon: "6_to_12_months",
    status: "active",
    claims: [validClaim, { ...validClaim, category: "valuation" }],
  };
}

describe("TickerSchema", () => {
  it("canonicalizes to uppercase and trims", () => {
    expect(TickerSchema.parse("  nvda ")).toBe("NVDA");
  });
  it("rejects non-letters and over-long tickers", () => {
    expect(TickerSchema.safeParse("NV1").success).toBe(false);
    expect(TickerSchema.safeParse("TOOLONG").success).toBe(false);
    expect(TickerSchema.safeParse("").success).toBe(false);
  });
});

describe("ClaimInputSchema", () => {
  it("accepts a 10–300 char statement with a valid category", () => {
    expect(ClaimInputSchema.safeParse(validClaim).success).toBe(true);
  });
  it("rejects too-short statements and bad categories", () => {
    expect(ClaimInputSchema.safeParse({ ...validClaim, statement: "too short" }).success).toBe(false);
    expect(ClaimInputSchema.safeParse({ ...validClaim, category: "nope" }).success).toBe(false);
  });
});

describe("CreateThesisSchema", () => {
  it("accepts 2–5 claims and canonicalizes the ticker", () => {
    const r = CreateThesisSchema.safeParse(baseThesis());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ticker).toBe("NVDA");
  });
  it("rejects fewer than 2 claims", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), claims: [validClaim] }).success).toBe(false);
  });
  it("rejects more than 5 claims", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), claims: Array(6).fill(validClaim) }).success).toBe(false);
  });
  it("rejects 'closed' as an initial status", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), status: "closed" }).success).toBe(false);
  });
});

describe("UpdateThesisSchema", () => {
  it("allows 'closed' status on update", () => {
    expect(UpdateThesisSchema.safeParse({ status: "closed" }).success).toBe(true);
  });
  it("allows a partial patch (notes only)", () => {
    expect(UpdateThesisSchema.safeParse({ notes: "watching capex" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schemas/thesis.test.ts`
Expected: FAIL — cannot resolve `./thesis`.

- [ ] **Step 3: Implement the schemas**

```ts
// schemas/thesis.ts
import { z } from "zod";

// Enum value tuples. These are intentionally duplicated in lib/db/schema.ts
// (pgEnum) because schema.ts must stay free of @/ imports for drizzle-kit, and
// this module must stay client-safe (zod only, no DB). Keep the two in sync.
export const POSITION_DIRECTIONS = ["long", "short"] as const;
export const TIME_HORIZONS = ["weeks", "months", "6_to_12_months", "years"] as const;
export const THESIS_STATUSES = ["active", "paused", "closed"] as const;
export const CREATE_STATUSES = ["active", "paused"] as const;
export const CLAIM_CATEGORIES = [
  "financial_performance",
  "product_traction",
  "competitive_position",
  "macro_environment",
  "execution",
  "valuation",
  "other",
] as const;

// Canonicalize (trim + uppercase) BEFORE validating so "  nvda " => "NVDA".
export const TickerSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
  z.string().regex(/^[A-Z]{1,6}$/, "Ticker must be 1–6 uppercase letters"),
);

export const ClaimCategorySchema = z.enum(CLAIM_CATEGORIES);

export const ClaimInputSchema = z.object({
  statement: z
    .string()
    .trim()
    .min(10, "Claim must be at least 10 characters")
    .max(300, "Claim must be at most 300 characters"),
  category: ClaimCategorySchema,
});

export const CreateThesisSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(120, "Title is too long"),
  ticker: TickerSchema,
  positionDirection: z.enum(POSITION_DIRECTIONS),
  timeHorizon: z.enum(TIME_HORIZONS),
  status: z.enum(CREATE_STATUSES),
  notes: z.string().trim().max(2000).optional(),
  claims: z
    .array(ClaimInputSchema)
    .min(2, "Add at least 2 claims")
    .max(5, "A thesis can have at most 5 claims"),
});

export const UpdateThesisSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  status: z.enum(THESIS_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateThesisInput = z.infer<typeof CreateThesisSchema>;
export type UpdateThesisInput = z.infer<typeof UpdateThesisSchema>;
export type ClaimInput = z.infer<typeof ClaimInputSchema>;
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>;
export type PositionDirection = (typeof POSITION_DIRECTIONS)[number];
export type TimeHorizon = (typeof TIME_HORIZONS)[number];
export type ThesisStatus = (typeof THESIS_STATUSES)[number];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schemas/thesis.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit** (after approval)

Run: `npm run typecheck` → expect clean.

```bash
git add schemas/thesis.ts schemas/thesis.test.ts
git commit -m "feat: add thesis/claim validation schemas"
```

---

### Task 3: Claim-count invariant predicates (TDD)

**Files:**
- Create: `lib/theses/claim-invariants.ts`
- Test: `lib/theses/claim-invariants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/theses/claim-invariants.test.ts
import { describe, it, expect } from "vitest";
import { canAddClaim, canDeleteClaim, MIN_CLAIMS, MAX_CLAIMS } from "./claim-invariants";

describe("claim invariants", () => {
  it("blocks adding once at the max", () => {
    expect(canAddClaim(MAX_CLAIMS - 1)).toBe(true);
    expect(canAddClaim(MAX_CLAIMS)).toBe(false);
  });
  it("blocks deleting once at the min", () => {
    expect(canDeleteClaim(MIN_CLAIMS + 1)).toBe(true);
    expect(canDeleteClaim(MIN_CLAIMS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/theses/claim-invariants.test.ts`
Expected: FAIL — cannot resolve `./claim-invariants`.

- [ ] **Step 3: Implement**

```ts
// lib/theses/claim-invariants.ts
export const MIN_CLAIMS = 2;
export const MAX_CLAIMS = 5;

export function canAddClaim(currentCount: number): boolean {
  return currentCount < MAX_CLAIMS;
}

export function canDeleteClaim(currentCount: number): boolean {
  return currentCount > MIN_CLAIMS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/theses/claim-invariants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (after approval)

```bash
git add lib/theses/claim-invariants.ts lib/theses/claim-invariants.test.ts
git commit -m "feat: add claim-count invariant predicates"
```

---

### Task 4: Schema + migration

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Append enums and tables to `lib/db/schema.ts`**

Add these imports to the existing import (keep `pgTable, uuid, text, timestamp`):

```ts
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
```

Append below the existing `users` table (do NOT modify `users`):

```ts
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
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file in `drizzle/` (e.g. `0001_*.sql`) creating the four enums + two tables + indexes. Open it and confirm it has `CREATE TYPE`, `CREATE TABLE theses`, `CREATE TABLE claims`, the FKs with `ON DELETE cascade`, and the indexes.

- [ ] **Step 3: Apply the migration**

Run: `npm run db:migrate`
Expected: applies cleanly against Neon.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit** (after approval — includes the generated migration)

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add theses and claims tables"
```

---

### Task 5: `requireUserId` auth helper

**Files:**
- Create: `lib/auth/require-user.ts`

- [ ] **Step 1: Implement**

```ts
// lib/auth/require-user.ts
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserByClerkId } from "@/lib/db/repositories/users";

/**
 * Resolves the signed-in Clerk user to our local `users.id` (uuid), used to
 * scope every ownership check. The app layout already calls `ensureUserExists`,
 * so a row should exist; if not (or unauthenticated), bounce to sign-in.
 */
export async function requireUserId(): Promise<string> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");
  const user = await getUserByClerkId(clerkUserId);
  if (!user) redirect("/sign-in");
  return user.id;
}
```

- [ ] **Step 2: Typecheck + commit** (after approval)

Run: `npm run typecheck` → clean.

```bash
git add lib/auth/require-user.ts
git commit -m "feat: add requireUserId helper resolving Clerk to local user"
```

---

### Task 6: Theses repository

**Files:**
- Create: `lib/db/repositories/theses.ts`

- [ ] **Step 1: Implement**

```ts
// lib/db/repositories/theses.ts
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { theses, claims, type Thesis, type Claim } from "@/lib/db/schema";
import type { CreateThesisInput, UpdateThesisInput } from "@/schemas/thesis";

export type ThesisListItem = Thesis & { claimCount: number };
export type ThesisWithClaims = Thesis & { claims: Claim[] };

/**
 * Atomic create via db.batch (neon-http has no interactive transactions).
 * The thesis id is generated up front so the claim rows can reference it
 * inside the same all-or-nothing batch.
 */
export async function createThesisWithClaims(
  userId: string,
  input: CreateThesisInput,
): Promise<string> {
  const thesisId = crypto.randomUUID();
  await db.batch([
    db.insert(theses).values({
      id: thesisId,
      userId,
      title: input.title,
      ticker: input.ticker,
      positionDirection: input.positionDirection,
      timeHorizon: input.timeHorizon,
      status: input.status,
      notes: input.notes ?? null,
    }),
    db.insert(claims).values(
      input.claims.map((c, i) => ({
        thesisId,
        ordinal: i,
        statement: c.statement,
        category: c.category,
      })),
    ),
  ]);
  return thesisId;
}

export async function listThesesByUser(userId: string): Promise<ThesisListItem[]> {
  const rows = await db
    .select({ thesis: theses, claimCount: sql<number>`count(${claims.id})::int` })
    .from(theses)
    .leftJoin(claims, eq(claims.thesisId, theses.id))
    .where(eq(theses.userId, userId))
    .groupBy(theses.id)
    .orderBy(desc(theses.updatedAt));
  return rows.map((r) => ({ ...r.thesis, claimCount: r.claimCount }));
}

export async function getThesisForUser(
  userId: string,
  thesisId: string,
): Promise<ThesisWithClaims | null> {
  const [thesis] = await db
    .select()
    .from(theses)
    .where(and(eq(theses.id, thesisId), eq(theses.userId, userId)))
    .limit(1);
  if (!thesis) return null;
  const claimRows = await db
    .select()
    .from(claims)
    .where(eq(claims.thesisId, thesisId))
    .orderBy(claims.ordinal);
  return { ...thesis, claims: claimRows };
}

export async function updateThesis(
  userId: string,
  thesisId: string,
  patch: UpdateThesisInput,
): Promise<void> {
  // Drizzle omits undefined keys from the generated UPDATE, so a partial patch
  // only touches the fields the caller provided.
  await db
    .update(theses)
    .set(patch)
    .where(and(eq(theses.id, thesisId), eq(theses.userId, userId)));
}

export async function deleteThesis(userId: string, thesisId: string): Promise<void> {
  await db.delete(theses).where(and(eq(theses.id, thesisId), eq(theses.userId, userId)));
}
```

- [ ] **Step 2: Typecheck + commit** (after approval)

Run: `npm run typecheck` → clean.

```bash
git add lib/db/repositories/theses.ts
git commit -m "feat: add theses repository"
```

---

### Task 7: Claims repository

**Files:**
- Create: `lib/db/repositories/claims.ts`

- [ ] **Step 1: Implement**

```ts
// lib/db/repositories/claims.ts
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { claims, theses } from "@/lib/db/schema";
import type { ClaimInput } from "@/schemas/thesis";
import { canAddClaim, canDeleteClaim } from "@/lib/theses/claim-invariants";

export type AddClaimResult = { ok: true; claimId: string } | { ok: false; reason: "not_found" | "max_claims" };
export type MutateClaimResult = { ok: true } | { ok: false; reason: "not_found" | "min_claims" };

async function claimOwnedBy(userId: string, claimId: string): Promise<{ thesisId: string } | null> {
  const [row] = await db
    .select({ thesisId: claims.thesisId })
    .from(claims)
    .innerJoin(theses, eq(theses.id, claims.thesisId))
    .where(and(eq(claims.id, claimId), eq(theses.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function thesisOwnedBy(userId: string, thesisId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: theses.id })
    .from(theses)
    .where(and(eq(theses.id, thesisId), eq(theses.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function countClaims(thesisId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(claims)
    .where(eq(claims.thesisId, thesisId));
  return row?.c ?? 0;
}

export async function addClaim(
  userId: string,
  thesisId: string,
  input: ClaimInput,
): Promise<AddClaimResult> {
  if (!(await thesisOwnedBy(userId, thesisId))) return { ok: false, reason: "not_found" };
  if (!canAddClaim(await countClaims(thesisId))) return { ok: false, reason: "max_claims" };
  const [maxRow] = await db
    .select({ ordinal: claims.ordinal })
    .from(claims)
    .where(eq(claims.thesisId, thesisId))
    .orderBy(desc(claims.ordinal))
    .limit(1);
  const nextOrdinal = (maxRow?.ordinal ?? -1) + 1;
  const [row] = await db
    .insert(claims)
    .values({ thesisId, ordinal: nextOrdinal, statement: input.statement, category: input.category })
    .returning({ id: claims.id });
  return { ok: true, claimId: row.id };
}

export async function updateClaim(
  userId: string,
  claimId: string,
  patch: Partial<ClaimInput>,
): Promise<MutateClaimResult> {
  if (!(await claimOwnedBy(userId, claimId))) return { ok: false, reason: "not_found" };
  await db.update(claims).set(patch).where(eq(claims.id, claimId));
  return { ok: true };
}

export async function deleteClaim(userId: string, claimId: string): Promise<MutateClaimResult> {
  const owned = await claimOwnedBy(userId, claimId);
  if (!owned) return { ok: false, reason: "not_found" };
  if (!canDeleteClaim(await countClaims(owned.thesisId))) return { ok: false, reason: "min_claims" };
  await db.delete(claims).where(eq(claims.id, claimId));
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck + commit** (after approval)

Run: `npm run typecheck` → clean.

```bash
git add lib/db/repositories/claims.ts
git commit -m "feat: add claims repository with ownership and count invariants"
```

---

### Task 8: Server Actions

**Files:**
- Create: `app/(app)/theses/actions.ts`

- [ ] **Step 1: Implement**

```ts
// app/(app)/theses/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { CreateThesisSchema, UpdateThesisSchema, ClaimInputSchema } from "@/schemas/thesis";
import * as thesesRepo from "@/lib/db/repositories/theses";
import * as claimsRepo from "@/lib/db/repositories/claims";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function firstIssue(message?: string): string {
  return message ?? "Invalid input";
}

export async function createThesis(input: unknown): Promise<ActionResult<{ thesisId: string }>> {
  const parsed = CreateThesisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues[0]?.message) };
  const userId = await requireUserId();
  const thesisId = await thesesRepo.createThesisWithClaims(userId, parsed.data);
  revalidatePath("/theses");
  return { ok: true, data: { thesisId } };
}

export async function updateThesis(thesisId: string, patch: unknown): Promise<ActionResult> {
  const parsed = UpdateThesisSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues[0]?.message) };
  const userId = await requireUserId();
  await thesesRepo.updateThesis(userId, thesisId, parsed.data);
  revalidatePath(`/theses/${thesisId}`);
  revalidatePath("/theses");
  return { ok: true, data: undefined };
}

export async function deleteThesis(thesisId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  await thesesRepo.deleteThesis(userId, thesisId);
  revalidatePath("/theses");
  return { ok: true, data: undefined };
}

export async function addClaim(thesisId: string, input: unknown): Promise<ActionResult> {
  const parsed = ClaimInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues[0]?.message) };
  const userId = await requireUserId();
  const res = await claimsRepo.addClaim(userId, thesisId, parsed.data);
  if (!res.ok) {
    return { ok: false, error: res.reason === "max_claims" ? "A thesis can have at most 5 claims" : "Thesis not found" };
  }
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: undefined };
}

export async function updateClaim(thesisId: string, claimId: string, patch: unknown): Promise<ActionResult> {
  const parsed = ClaimInputSchema.partial().safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues[0]?.message) };
  const userId = await requireUserId();
  const res = await claimsRepo.updateClaim(userId, claimId, parsed.data);
  if (!res.ok) return { ok: false, error: "Claim not found" };
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: undefined };
}

export async function deleteClaim(thesisId: string, claimId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const res = await claimsRepo.deleteClaim(userId, claimId);
  if (!res.ok) {
    return { ok: false, error: res.reason === "min_claims" ? "A thesis needs at least 2 claims" : "Claim not found" };
  }
  revalidatePath(`/theses/${thesisId}`);
  return { ok: true, data: undefined };
}
```

- [ ] **Step 2: Typecheck + commit** (after approval)

Run: `npm run typecheck` → clean.

```bash
git add "app/(app)/theses/actions.ts"
git commit -m "feat: add thesis and claim server actions"
```

---

### Task 9: Add shadcn UI components

**Files:**
- Create: `components/ui/select.tsx`, `textarea.tsx`, `badge.tsx`, `tooltip.tsx`, `alert-dialog.tsx`

Follow the **registry-fetch method** documented in `docs/DESIGN.md` decisions log (2026-06-11): pull canonical `new-york-v4` source from the shadcn registry rather than the CLI.

- [ ] **Step 1: Fetch each component's source**

For each of `select`, `textarea`, `badge`, `tooltip`, `alert-dialog`, fetch its registry JSON and write each entry in `files[]` to `components/ui/<name>.tsx`:

```bash
for c in select textarea badge tooltip alert-dialog; do
  curl -s "https://ui.shadcn.com/r/styles/new-york-v4/$c.json" -o "/tmp/$c.json"
done
```

Then, for each file, extract `.files[].content` (path `components/ui/<name>.tsx`) and write it verbatim into the repo. Verify each file imports from `radix-ui` (already a dependency) and from `@/lib/utils` (exists).

- [ ] **Step 2: Check for new dependencies**

Inspect each JSON's `dependencies` array. `radix-ui` is already installed; if any component declares a package NOT already in `package.json`, **stop and ask the user for approval before installing** (per CLAUDE.md "don't add dependencies without asking"). Expected: none new.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. (If an import path differs from the repo's convention, fix to match `button.tsx`.)

- [ ] **Step 4: Commit** (after approval)

```bash
git add components/ui/select.tsx components/ui/textarea.tsx components/ui/badge.tsx components/ui/tooltip.tsx components/ui/alert-dialog.tsx package.json package-lock.json
git commit -m "chore: add select, textarea, badge, tooltip, alert-dialog shadcn components"
```

---

### Task 10: Label maps + CategoryBadge

**Files:**
- Create: `lib/theses/labels.ts`, `components/theses/CategoryBadge.tsx`

- [ ] **Step 1: Implement label maps**

```ts
// lib/theses/labels.ts
import type {
  ClaimCategory,
  PositionDirection,
  TimeHorizon,
  ThesisStatus,
} from "@/schemas/thesis";

export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  financial_performance: "Financial performance",
  product_traction: "Product traction",
  competitive_position: "Competitive position",
  macro_environment: "Macro environment",
  execution: "Execution",
  valuation: "Valuation",
  other: "Other",
};

export const DIRECTION_LABELS: Record<PositionDirection, string> = {
  long: "Long",
  short: "Short",
};

export const HORIZON_LABELS: Record<TimeHorizon, string> = {
  weeks: "Weeks",
  months: "Months",
  "6_to_12_months": "6–12 months",
  years: "Years",
};

export const STATUS_LABELS: Record<ThesisStatus, string> = {
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};
```

- [ ] **Step 2: Implement CategoryBadge**

```tsx
// components/theses/CategoryBadge.tsx
import type { ClaimCategory } from "@/schemas/thesis";
import { CATEGORY_LABELS } from "@/lib/theses/labels";

export function CategoryBadge({ category }: { category: ClaimCategory }) {
  return (
    <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck + commit** (after approval)

Run: `npm run typecheck` → clean.

```bash
git add lib/theses/labels.ts components/theses/CategoryBadge.tsx
git commit -m "feat: add thesis label maps and category badge"
```

---

### Task 11: Thesis list page (flat rows + empty state)

**Files:**
- Create: `components/theses/ThesisRow.tsx`
- Modify: `app/(app)/theses/page.tsx`

- [ ] **Step 1: Implement ThesisRow (server component)**

```tsx
// components/theses/ThesisRow.tsx
import Link from "next/link";
import type { ThesisListItem } from "@/lib/db/repositories/theses";
import { DIRECTION_LABELS, HORIZON_LABELS, STATUS_LABELS } from "@/lib/theses/labels";

export function ThesisRow({ thesis }: { thesis: ThesisListItem }) {
  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";
  const statusClass =
    thesis.status === "active"
      ? "bg-[#eef2f6] text-primary"
      : "bg-zinc-100 text-zinc-500";
  return (
    <Link
      href={`/theses/${thesis.id}`}
      className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-zinc-100 px-2 py-4 hover:bg-zinc-50/70"
    >
      <div>
        <div className="flex items-center gap-3">
          <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">
            {thesis.ticker}
          </span>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>
            {DIRECTION_LABELS[thesis.positionDirection]}
          </span>
          <span className="text-sm font-medium text-zinc-900">{thesis.title}</span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-400">
          {thesis.claimCount} {thesis.claimCount === 1 ? "claim" : "claims"} ·{" "}
          {HORIZON_LABELS[thesis.timeHorizon]}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="h-1.5 w-20 rounded-full border border-dashed border-zinc-300" />
        Not analyzed yet
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}>
        {STATUS_LABELS[thesis.status]}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Rewrite the list page (server component)**

```tsx
// app/(app)/theses/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/require-user";
import { listThesesByUser } from "@/lib/db/repositories/theses";
import { ThesisRow } from "@/components/theses/ThesisRow";

export default async function ThesesPage() {
  const userId = await requireUserId();
  const theses = await listThesesByUser(userId);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Your theses</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {theses.length === 0
              ? "Positions you're tracking. The agent watches each one for new evidence."
              : `${theses.length} ${theses.length === 1 ? "position" : "positions"} tracked`}
          </p>
        </div>
        <Button asChild>
          <Link href="/theses/new">New thesis</Link>
        </Button>
      </div>

      {theses.length === 0 ? (
        <div className="mt-14 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 px-6 py-20 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
            <span className="size-4 rounded-[4px] bg-primary/15 ring-1 ring-inset ring-primary/30" />
          </div>
          <p className="mt-5 font-medium text-zinc-900">No theses yet</p>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
            Write a position and a few claims, and the agent takes it from there.
          </p>
          <Button asChild className="mt-6">
            <Link href="/theses/new">Create your first thesis</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 border-t border-zinc-200">
          {theses.map((t) => (
            <ThesisRow key={t.id} thesis={t} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + manual check**

Run: `npm run typecheck` → clean.
Manual: `npm run dev`, visit `/theses` — empty state shows with working "Create your first thesis" link to `/theses/new` (will 404 until Task 12). Confirm no crash.

- [ ] **Step 4: Commit** (after approval)

```bash
git add components/theses/ThesisRow.tsx "app/(app)/theses/page.tsx"
git commit -m "feat: real thesis list with flat rows and empty state"
```

---

### Task 12: ClaimForm + New Thesis wizard

**Files:**
- Create: `components/theses/ClaimForm.tsx`, `components/theses/NewThesisWizard.tsx`, `app/(app)/theses/new/page.tsx`

- [ ] **Step 1: Implement ClaimForm (shared, client)**

```tsx
// components/theses/ClaimForm.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLAIM_CATEGORIES, type ClaimCategory, type ClaimInput } from "@/schemas/thesis";
import { CATEGORY_LABELS } from "@/lib/theses/labels";

type Props = {
  initial?: ClaimInput;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (input: ClaimInput) => void;
  onCancel?: () => void;
};

export function ClaimForm({ initial, submitLabel, pending, onSubmit, onCancel }: Props) {
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [category, setCategory] = useState<ClaimCategory>(initial?.category ?? "financial_performance");
  const trimmed = statement.trim();
  const valid = trimmed.length >= 10 && trimmed.length <= 300;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5">
      <Textarea
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        rows={2}
        placeholder="A falsifiable statement the agent will hunt evidence for…"
        className="resize-none bg-white"
      />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v as ClaimCategory)}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLAIM_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!valid || pending}
            onClick={() => onSubmit({ statement: trimmed, category })}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">{trimmed.length}/300 · min 10 characters</p>
    </div>
  );
}
```

> Note: `Button` variants (`ghost`) and `size` (`sm`) come from the Phase 1 `button.tsx` (verify those variant names exist; if not, use the closest equivalent).

- [ ] **Step 2: Implement the wizard (client)**

```tsx
// components/theses/NewThesisWizard.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClaimForm } from "@/components/theses/ClaimForm";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import {
  TIME_HORIZONS,
  CREATE_STATUSES,
  type ClaimInput,
  type PositionDirection,
  type TimeHorizon,
} from "@/schemas/thesis";
import { HORIZON_LABELS, STATUS_LABELS } from "@/lib/theses/labels";
import { MAX_CLAIMS, MIN_CLAIMS } from "@/lib/theses/claim-invariants";
import { createThesis } from "@/app/(app)/theses/actions";

export function NewThesisWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [ticker, setTicker] = useState("");
  const [direction, setDirection] = useState<PositionDirection>("long");
  const [horizon, setHorizon] = useState<TimeHorizon>("6_to_12_months");
  const [status, setStatus] = useState<(typeof CREATE_STATUSES)[number]>("active");
  const [claims, setClaims] = useState<ClaimInput[]>([]);

  const tickerOk = /^[A-Z]{1,6}$/.test(ticker.trim().toUpperCase());
  const titleOk = title.trim().length >= 3;
  const step1Ok = tickerOk && titleOk;

  function submit() {
    startTransition(async () => {
      const res = await createThesis({
        title,
        ticker,
        positionDirection: direction,
        timeHorizon: horizon,
        status,
        claims,
      });
      if (res.ok) {
        router.push(`/theses/${res.data.thesisId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-2.5 text-xs">
        <span className={step === 1 ? "font-semibold text-primary" : "text-zinc-400"}>1 · Position</span>
        <span className="h-1 w-1 rounded-full bg-zinc-300" />
        <span className={step === 2 ? "font-semibold text-primary" : "text-zinc-400"}>2 · Claims</span>
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">What position are you tracking?</h1>
            <p className="mt-1 text-sm text-zinc-500">Ticker and direction are locked once you create the thesis.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Long NVDA — data center demand" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-40 font-mono uppercase"
              placeholder="NVDA"
            />
            <p className="text-[11px] text-zinc-400">1–6 letters. We canonicalize it for you.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200">
              {(["long", "short"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`px-4 py-2 text-sm font-medium ${
                    direction === d ? "bg-primary text-primary-foreground" : "text-zinc-500"
                  }`}
                >
                  {d === "long" ? "Long" : "Short"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Time horizon</Label>
            <Select value={horizon} onValueChange={(v) => setHorizon(v as TimeHorizon)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_HORIZONS.map((h) => (
                  <SelectItem key={h} value={h}>{HORIZON_LABELS[h]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as (typeof CREATE_STATUSES)[number])}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREATE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-400">Set to Paused if you're still planning — the agent won't run on a paused thesis.</p>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => router.push("/theses")}>Cancel</Button>
            <Button disabled={!step1Ok} onClick={() => setStep(2)}>Next: Claims →</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              What has to be true?{" "}
              <span className="text-sm font-normal text-zinc-400">
                {claims.length} of {MIN_CLAIMS}–{MAX_CLAIMS}
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Falsifiable statements the agent will hunt evidence for.</p>
          </div>

          {claims.map((c, i) => (
            <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CategoryBadge category={c.category} />
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-[#C0492F]"
                  onClick={() => setClaims((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {claims.length < MAX_CLAIMS ? (
            <ClaimForm
              key={claims.length}
              submitLabel="Add claim"
              onSubmit={(input) => setClaims((prev) => [...prev, input])}
            />
          ) : (
            <p className="text-xs text-zinc-400">Maximum of {MAX_CLAIMS} claims reached.</p>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
            <Button disabled={claims.length < MIN_CLAIMS || pending} onClick={submit}>
              {pending ? "Creating…" : "Create thesis"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the route**

```tsx
// app/(app)/theses/new/page.tsx
import { NewThesisWizard } from "@/components/theses/NewThesisWizard";

export default function NewThesisPage() {
  return <NewThesisWizard />;
}
```

- [ ] **Step 4: Typecheck + manual check**

Run: `npm run typecheck && npm run lint` → clean.
Manual: at `/theses/new`, fill step 1, advance, add 2 claims, create. Confirm redirect to the new detail route (will 404 until Task 13 — but the thesis should now appear at `/theses`). Try: invalid ticker blocks "Next"; <2 claims disables "Create"; 6th claim form hidden.

- [ ] **Step 5: Commit** (after approval)

```bash
git add components/theses/ClaimForm.tsx components/theses/NewThesisWizard.tsx "app/(app)/theses/new/page.tsx"
git commit -m "feat: new-thesis wizard with shared claim form"
```

---

### Task 13: Thesis detail page (two-column)

**Files:**
- Create: `components/theses/StatusSelect.tsx`, `components/theses/NotesEditor.tsx`, `components/theses/ClaimList.tsx`, `components/theses/DeleteThesisButton.tsx`, `app/(app)/theses/[thesisId]/page.tsx`

- [ ] **Step 1: StatusSelect (client)**

```tsx
// components/theses/StatusSelect.tsx
"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { THESIS_STATUSES, type ThesisStatus } from "@/schemas/thesis";
import { STATUS_LABELS } from "@/lib/theses/labels";
import { updateThesis } from "@/app/(app)/theses/actions";

export function StatusSelect({ thesisId, status }: { thesisId: string; status: ThesisStatus }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(v) =>
        startTransition(async () => {
          const res = await updateThesis(thesisId, { status: v as ThesisStatus });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="h-7 w-28 border-none px-2 text-sm font-medium shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THESIS_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: NotesEditor (client)**

```tsx
// components/theses/NotesEditor.tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateThesis } from "@/app/(app)/theses/actions";

export function NotesEditor({ thesisId, notes }: { thesisId: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return notes ? (
      <p className="text-sm leading-relaxed text-zinc-600" onClick={() => setEditing(true)}>
        {notes}
      </p>
    ) : (
      <button type="button" className="text-sm text-zinc-400 hover:text-zinc-600" onClick={() => setEditing(true)}>
        + Add notes
      </button>
    );
  }

  return (
    <div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="resize-none" />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateThesis(thesisId, { notes: value.trim() });
              if (res.ok) setEditing(false);
              else toast.error(res.error);
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(notes ?? ""); setEditing(false); }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ClaimList (client) — inline add/edit/delete**

```tsx
// components/theses/ClaimList.tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClaimForm } from "@/components/theses/ClaimForm";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory, ClaimInput } from "@/schemas/thesis";
import { MAX_CLAIMS } from "@/lib/theses/claim-invariants";
import { addClaim, updateClaim, deleteClaim } from "@/app/(app)/theses/actions";

export function ClaimList({ thesisId, claims }: { thesisId: string; claims: Claim[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk?.();
      else toast.error(res.error ?? "Something went wrong");
    });
  }

  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Claims · {claims.length}
      </p>

      {claims.map((c) =>
        editingId === c.id ? (
          <div key={c.id} className="py-3.5">
            <ClaimForm
              initial={{ statement: c.statement, category: c.category as ClaimCategory }}
              submitLabel="Save"
              pending={pending}
              onCancel={() => setEditingId(null)}
              onSubmit={(input: ClaimInput) =>
                run(() => updateClaim(thesisId, c.id, input), () => setEditingId(null))
              }
            />
          </div>
        ) : (
          <div key={c.id} className="border-b border-zinc-100 py-3.5">
            <CategoryBadge category={c.category as ClaimCategory} />
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
            <div className="mt-1.5 flex gap-3.5 text-xs text-zinc-400">
              <button type="button" className="hover:text-zinc-700" onClick={() => setEditingId(c.id)}>
                Edit
              </button>
              <button
                type="button"
                className="hover:text-[#C0492F]"
                disabled={pending}
                onClick={() => run(() => deleteClaim(thesisId, c.id))}
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <div className="py-3.5">
          <ClaimForm
            submitLabel="Add claim"
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) => run(() => addClaim(thesisId, input), () => setAdding(false))}
          />
        </div>
      ) : claims.length < MAX_CLAIMS ? (
        <Button variant="ghost" size="sm" className="mt-3 px-0 text-primary" onClick={() => setAdding(true)}>
          + Add claim
        </Button>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">Maximum of {MAX_CLAIMS} claims.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: DeleteThesisButton (client) — AlertDialog**

```tsx
// components/theses/DeleteThesisButton.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteThesis } from "@/app/(app)/theses/actions";

export function DeleteThesisButton({ thesisId, title }: { thesisId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-[#C0492F]">
          Delete thesis
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this thesis?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” and all its claims will be permanently removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await deleteThesis(thesisId);
                if (res.ok) router.push("/theses");
                else toast.error(res.error);
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Detail page (server component)**

```tsx
// app/(app)/theses/[thesisId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { DIRECTION_LABELS, HORIZON_LABELS } from "@/lib/theses/labels";
import { ClaimList } from "@/components/theses/ClaimList";
import { StatusSelect } from "@/components/theses/StatusSelect";
import { NotesEditor } from "@/components/theses/NotesEditor";
import { DeleteThesisButton } from "@/components/theses/DeleteThesisButton";

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) notFound();

  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";

  return (
    <div>
      <Link href="/theses" className="text-xs text-zinc-400 hover:text-zinc-600">
        Theses / {thesis.ticker}
      </Link>

      <div className="mt-3.5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{thesis.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">
              {thesis.ticker}
            </span>
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>
              {DIRECTION_LABELS[thesis.positionDirection]}
            </span>
            <span className="text-xs text-zinc-400">· {HORIZON_LABELS[thesis.timeHorizon]}</span>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button variant="outline" disabled>
                Analyze now
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Available next phase</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
        <ClaimList thesisId={thesis.id} claims={thesis.claims} />

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 p-4 text-sm">
            <Row k="Ticker"><span className="font-mono">{thesis.ticker}</span></Row>
            <Row k="Position">{DIRECTION_LABELS[thesis.positionDirection]}</Row>
            <Row k="Horizon">{HORIZON_LABELS[thesis.timeHorizon]}</Row>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-zinc-400">Status</span>
              <StatusSelect thesisId={thesis.id} status={thesis.status} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Notes</p>
            <NotesEditor thesisId={thesis.id} notes={thesis.notes} />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis</p>
            <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-xs text-zinc-400">
              No analysis yet — available next phase
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <DeleteThesisButton thesisId={thesis.id} title={thesis.title} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-1.5 last:border-none">
      <span className="text-zinc-400">{k}</span>
      <span className="font-medium text-zinc-700">{children}</span>
    </div>
  );
}
```

> If `Button` lacks an `outline` variant, use the variant Phase 1 defined for secondary buttons. Confirm against `components/ui/button.tsx`.
> Radix Tooltip needs a `TooltipProvider`. The new-york-v4 `tooltip.tsx` wraps the provider inside `Tooltip` automatically — confirm that; if it doesn't, wrap the `Tooltip` here in `<TooltipProvider>` (or add it once in `app/(app)/layout.tsx`).

- [ ] **Step 6: Typecheck + lint + manual check**

Run: `npm run typecheck && npm run lint` → clean.
Manual end-to-end: create a thesis → land on detail → edit a claim inline → add a claim (up to 5; form hides at 5) → try deleting down to 2 (3rd delete blocked with "A thesis needs at least 2 claims" toast) → change status → add/edit notes → "Analyze now" is disabled with tooltip → delete thesis (confirm dialog → redirect to `/theses`). Visit another user's thesis id (or a random uuid) → `notFound()`.

- [ ] **Step 7: Commit** (after approval)

```bash
git add components/theses/StatusSelect.tsx components/theses/NotesEditor.tsx components/theses/ClaimList.tsx components/theses/DeleteThesisButton.tsx "app/(app)/theses/[thesisId]/page.tsx"
git commit -m "feat: thesis detail page with inline claim editing and delete"
```

---

### Task 14: DESIGN.md + final verification

**Files:**
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Fill the per-screen blocks**

Under `### /theses (thesis list)` add: chosen **flat rows** (Linear-style, hairline `zinc-100` separators), ticker pill (mono) + Long/Short tag + title on the left, honest **"Not analyzed yet"** placeholder (dashed empty track, no fabricated score), status chip right; "New thesis" is a primary button → `/theses/new`.

Under `### /theses/[id]` add: **two-column** — main column = claims (category badge + statement + inline edit via shared `ClaimForm`), right rail = read-only meta (ticker/position/horizon) + editable status + notes + a "No analysis yet" placeholder + delete (AlertDialog). Trace/health will extend the rail/main in Phases 3–4; the trace itself opens full-width.

Under `### New thesis flow` note the Phase 2 manual flow: dedicated `/theses/new` route, two steps (Position → Claims), shared `ClaimForm`, notes deferred to detail.

Add to the decisions log (newest first), dated 2026-06-12:
- Thesis list = flat rows over cards (density on data surfaces).
- Detail = two-column with right rail (scales to Phase 3/4 without redesign).
- New-thesis = dedicated route, not modal (scales to Phase 6 paragraph tab).
- Claim editing = inline via one shared `ClaimForm`; reordering deferred (ordinal = append order).
- Status enum kept at active/paused/closed (no `draft`; "still planning" = paused).
- Health placeholder is explicit "Not analyzed yet", never a fabricated `0.00`.

- [ ] **Step 2: Full verification sweep**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green (the two TDD suites + Phase 1 suite pass; typecheck and lint clean).

- [ ] **Step 3: Commit** (after approval)

```bash
git add docs/DESIGN.md
git commit -m "docs: record Phase 2 per-screen design decisions"
```

---

## Self-review notes (author)

- **Spec coverage:** schema+enums (T4); repositories (T6/T7); all 8 server actions (T8 — `listTheses`/`getThesis` are served by direct Server Component reads of the repository per the spec, not redundant action wrappers); list/wizard/detail UI (T11/T12/T13); empty states + validation + blocked-deletion message (T11/T12/T13); honest health placeholder (T11/T13); immutable ticker/position/horizon (only `UpdateThesisSchema` exposes title/status/notes — T2); min-2/max-5 invariants in repo via pure predicates (T3/T7); native forms via `useTransition` (no RHF). 
- **Deliberate deviation from spec:** spec said `useActionState`; plan uses `useTransition` because the actions take structured args (not `FormData`), which is simpler and avoids serialization — still native React, no form library. Flag at execution if the user prefers `useActionState`.
- **Verify-at-execution items:** `button.tsx` variant/size names (`ghost`/`outline`/`sm`) — adjust to whatever Phase 1 defined; shadcn registry components introduce no un-approved deps (T9 Step 2 gate).
