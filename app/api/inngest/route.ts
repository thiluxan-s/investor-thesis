import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAgent } from "@/lib/inngest/functions/run-agent";
import { evaluateRun } from "@/lib/inngest/functions/evaluate-run";
import { weeklyCron } from "@/lib/inngest/functions/weekly-cron";
import { scheduleRuns } from "@/lib/inngest/functions/schedule-runs";
import { generateDigest } from "@/lib/inngest/functions/generate-digest";

// Allow a long single Opus iteration within Vercel Hobby's ceiling.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAgent, evaluateRun, weeklyCron, scheduleRuns, generateDigest],
});
