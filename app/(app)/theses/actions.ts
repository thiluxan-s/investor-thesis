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
