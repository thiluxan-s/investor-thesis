import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, theses, type User } from "@/lib/db/schema";
import { DEMO_USER_CLERK_ID } from "@/lib/demo/constants";

export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row ?? null;
}

/**
 * Existence-only insert for the lazy fallback path (`ensureUserExists`). Leaves
 * an existing row untouched — the webhook is the source of truth for email.
 */
export async function createUserFromClerk(input: {
  clerkUserId: string;
  email: string;
}): Promise<User | null> {
  const [row] = await db
    .insert(users)
    .values({ clerkUserId: input.clerkUserId, email: input.email })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  return row ?? null;
}

/**
 * Insert-or-refresh keyed on `clerk_user_id`. Used by the Clerk webhook so a
 * `user.updated` self-heals a missing row and email stays current even if events
 * arrive out of order.
 */
export async function upsertUserFromClerk(input: {
  clerkUserId: string;
  email: string;
}): Promise<User | null> {
  const [row] = await db
    .insert(users)
    .values({ clerkUserId: input.clerkUserId, email: input.email })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email: input.email } })
    .returning();
  return row ?? null;
}

export async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}

export async function setDigestEnabled(userId: string, enabled: boolean): Promise<void> {
  await db.update(users).set({ digestEnabled: enabled }).where(eq(users.id, userId));
}

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// Distinct users that own at least one active thesis — the cron's scheduling set.
export async function listUserIdsWithActiveTheses(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: theses.userId })
    .from(theses)
    .innerJoin(users, eq(users.id, theses.userId))
    .where(and(eq(theses.status, "active"), ne(users.clerkUserId, DEMO_USER_CLERK_ID)));
  return rows.map((r) => r.userId);
}
