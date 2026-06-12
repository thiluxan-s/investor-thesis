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

async function countClaims(thesisId: string): Promise<number> {
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
  // Nothing to change — avoid an empty SET clause (Drizzle rejects it).
  if (Object.keys(patch).length === 0) return { ok: true };
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
