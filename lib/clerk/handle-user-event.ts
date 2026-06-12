import type { WebhookEvent } from "@clerk/nextjs/server";

export type UserEventResult =
  | { status: "handled"; action: "created" | "updated" | "deleted" }
  | { status: "ignored"; eventType: string };

export interface UserSync {
  upsertUserFromClerk(input: { clerkUserId: string; email: string }): Promise<unknown>;
  deleteUserByClerkId(clerkUserId: string): Promise<unknown>;
}

/** Returns the primary email, or null when none can be resolved. */
function primaryEmail(data: {
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}): string | null {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address || null;
}

export async function handleUserEvent(
  evt: WebhookEvent,
  sync: UserSync,
): Promise<UserEventResult> {
  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const email = primaryEmail(evt.data);
      if (!email) {
        // Don't persist a row with no email; skip rather than store an empty string.
        console.warn(`Clerk ${evt.type} for ${evt.data.id} had no resolvable email; skipping`);
        return { status: "ignored", eventType: evt.type };
      }
      await sync.upsertUserFromClerk({ clerkUserId: evt.data.id, email });
      return { status: "handled", action: evt.type === "user.created" ? "created" : "updated" };
    }
    case "user.deleted": {
      if (evt.data.id) await sync.deleteUserByClerkId(evt.data.id);
      return { status: "handled", action: "deleted" };
    }
    default:
      return { status: "ignored", eventType: evt.type };
  }
}
