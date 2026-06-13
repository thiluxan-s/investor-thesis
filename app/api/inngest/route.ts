import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAgent } from "@/lib/inngest/functions/run-agent";

// Allow a long single Opus iteration within Vercel Hobby's ceiling.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [runAgent] });
