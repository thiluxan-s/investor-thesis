import "server-only";
import { inngest } from "@/lib/inngest/client";
import { currentWeekOf } from "@/lib/digest/week";
import { serverEnv } from "@/lib/env.server";

// Sunday 09:00 UTC. Guarded: only fires real scheduling when explicitly enabled,
// so prod doesn't spend API budget unattended. The on-demand action ignores this flag.
export const weeklyCron = inngest.createFunction(
  { id: "weekly-cron", triggers: [{ cron: "0 9 * * 0" }] },
  async ({ step }) => {
    if (!serverEnv.SCHEDULED_RUNS_ENABLED) return { status: "disabled" as const };
    await step.sendEvent("emit-scheduled-runs", {
      name: "scheduled-runs.requested",
      data: { weekOf: currentWeekOf() },
    });
    return { status: "scheduled" as const };
  },
);
