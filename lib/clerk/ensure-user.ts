import { currentUser } from "@clerk/nextjs/server";
import { createUserFromClerk } from "@/lib/db/repositories/users";

/**
 * Idempotent fallback for the Clerk webhook: ensures the signed-in Clerk user
 * has a local `users` row. Safe to call on every protected request — the insert
 * is on-conflict-do-nothing.
 */
export async function ensureUserExists(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";
  await createUserFromClerk({ clerkUserId: user.id, email });
}
