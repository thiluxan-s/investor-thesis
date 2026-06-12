import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { WebhookEvent } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { handleUserEvent } from "@/lib/clerk/handle-user-event";
import {
  createUserFromClerk,
  updateUserEmail,
  deleteUserByClerkId,
} from "@/lib/db/repositories/users";

export async function POST(req: NextRequest) {
  let evt: WebhookEvent;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const result = await handleUserEvent(evt, {
    createUserFromClerk,
    updateUserEmail,
    deleteUserByClerkId,
  });

  if (result.status === "ignored") {
    return Response.json({ ignored: true, eventType: result.eventType }, { status: 200 });
  }
  return Response.json({ ok: true, action: result.action }, { status: 200 });
}
