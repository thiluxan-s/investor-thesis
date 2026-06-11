import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row ?? null;
}

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

export async function updateUserEmail(input: {
  clerkUserId: string;
  email: string;
}): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ email: input.email })
    .where(eq(users.clerkUserId, input.clerkUserId))
    .returning();
  return row ?? null;
}

export async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
