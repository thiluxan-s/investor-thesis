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
  // Caller guarantees 2–5 claims (enforced by CreateThesisSchema); db.insert
  // would throw on an empty values array.
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
  return rows.map((r) => ({ ...r.thesis, claimCount: Number(r.claimCount) }));
}

export async function getThesisForUser(
  userId: string,
  thesisId: string,
): Promise<ThesisWithClaims | null> {
  // Two independent reads issued as one batched round-trip (neon-http). Claims
  // are only returned when the ownership-scoped thesis row is present.
  const [thesisRows, claimRows] = await db.batch([
    db
      .select()
      .from(theses)
      .where(and(eq(theses.id, thesisId), eq(theses.userId, userId)))
      .limit(1),
    db.select().from(claims).where(eq(claims.thesisId, thesisId)).orderBy(claims.ordinal),
  ]);
  const thesis = thesisRows[0];
  if (!thesis) return null;
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
