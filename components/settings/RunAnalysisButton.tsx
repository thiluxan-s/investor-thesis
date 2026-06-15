"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerWeeklyDigestNow } from "@/app/(app)/theses/agent-actions";

export function RunAnalysisButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await triggerWeeklyDigestNow();
          if (res.ok) toast.success("Analysis queued — your digest emails when the runs finish.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Queuing…" : "Run weekly analysis now"}
    </Button>
  );
}
