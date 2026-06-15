"use server";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { setDigestEnabled } from "@/lib/db/repositories/users";
import type { ActionResult } from "@/app/(app)/theses/actions";

export async function setDigestEnabledAction(enabled: boolean): Promise<ActionResult> {
  const userId = await requireUserId();
  await setDigestEnabled(userId, enabled);
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
