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
