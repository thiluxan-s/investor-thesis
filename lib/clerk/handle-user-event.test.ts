import { describe, it, expect, vi } from "vitest";
import { handleUserEvent, type UserSync } from "./handle-user-event";

function makeSync(): UserSync {
  return {
    upsertUserFromClerk: vi.fn().mockResolvedValue(null),
    deleteUserByClerkId: vi.fn().mockResolvedValue(undefined),
  };
}

const userData = {
  id: "user_123",
  email_addresses: [
    { id: "idn_1", email_address: "primary@example.com" },
    { id: "idn_2", email_address: "other@example.com" },
  ],
  primary_email_address_id: "idn_1",
};

describe("handleUserEvent", () => {
  it("upserts the user on user.created using the primary email", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "user.created", data: userData } as never, sync);
    expect(sync.upsertUserFromClerk).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      email: "primary@example.com",
    });
    expect(result).toEqual({ status: "handled", action: "created" });
  });

  it("upserts on user.updated so a missing row self-heals", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "user.updated", data: userData } as never, sync);
    expect(sync.upsertUserFromClerk).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      email: "primary@example.com",
    });
    expect(result).toEqual({ status: "handled", action: "updated" });
  });

  it("deletes on user.deleted", async () => {
    const sync = makeSync();
    const result = await handleUserEvent(
      { type: "user.deleted", data: { id: "user_123" } } as never,
      sync,
    );
    expect(sync.deleteUserByClerkId).toHaveBeenCalledWith("user_123");
    expect(result).toEqual({ status: "handled", action: "deleted" });
  });

  it("ignores a user.created event with no resolvable email instead of writing an empty one", async () => {
    const sync = makeSync();
    const result = await handleUserEvent(
      {
        type: "user.created",
        data: { id: "user_456", email_addresses: [], primary_email_address_id: null },
      } as never,
      sync,
    );
    expect(sync.upsertUserFromClerk).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ignored", eventType: "user.created" });
  });

  it("ignores unhandled event types", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "session.created", data: {} } as never, sync);
    expect(sync.upsertUserFromClerk).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ignored", eventType: "session.created" });
  });
});
