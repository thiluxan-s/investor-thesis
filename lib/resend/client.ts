import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";
import { serverEnv } from "@/lib/env.server";

// Thin wrapper. Throws if email isn't configured (the digest function only calls
// this on the real path; dev/fixtures never send).
export async function sendDigestEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<void> {
  if (!serverEnv.RESEND_API_KEY || !serverEnv.RESEND_FROM_EMAIL) {
    throw new Error(
      "Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)",
    );
  }
  const resend = new Resend(serverEnv.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    react: input.react,
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}
