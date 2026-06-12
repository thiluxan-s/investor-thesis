import type { WebhookEvent } from "@clerk/nextjs/server";

export type UserEventResult =
  | { status: "handled"; action: "created" | "updated" | "deleted" }
  | { status: "ignored"; eventType: string };

export interface UserSync {
  createUserFromClerk(input: { clerkUserId: string; email: string }): Promise<unknown>;
  updateUserEmail(input: { clerkUserId: string; email: string }): Promise<unknown>;
  deleteUserByClerkId(clerkUserId: string): Promise<unknown>;
}

function primaryEmail(data: {
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}): string {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address ?? "";
}

export async function handleUserEvent(
  evt: WebhookEvent,
  sync: UserSync,
): Promise<UserEventResult> {
  switch (evt.type) {
    case "user.created": {
      await sync.createUserFromClerk({ clerkUserId: evt.data.id, email: primaryEmail(evt.data) });
      return { status: "handled", action: "created" };
    }
    case "user.updated": {
      await sync.updateUserEmail({ clerkUserId: evt.data.id, email: primaryEmail(evt.data) });
      return { status: "handled", action: "updated" };
    }
    case "user.deleted": {
      if (evt.data.id) await sync.deleteUserByClerkId(evt.data.id);
      return { status: "handled", action: "deleted" };
    }
    default:
      return { status: "ignored", eventType: evt.type };
  }
}
