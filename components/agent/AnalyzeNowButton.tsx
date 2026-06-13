"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerAgentRun } from "@/app/(app)/theses/agent-actions";

export function AnalyzeNowButton({ thesisId, disabled }: { thesisId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          const res = await triggerAgentRun(thesisId);
          if (res.ok) router.refresh();
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Starting…" : disabled ? "Analyzing…" : "Analyze now"}
    </Button>
  );
}
