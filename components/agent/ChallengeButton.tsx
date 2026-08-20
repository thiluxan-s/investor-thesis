"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { triggerAgentRun } from "@/app/(app)/theses/agent-actions";

export function ChallengeButton({ thesisId, disabled }: { thesisId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending || disabled}>
          {pending ? "Starting…" : "Challenge"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Challenge this thesis?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent searches for evidence that would make this thesis <em>less</em> likely to hold, then
            writes up the case against it. It runs the same way an analysis does and takes about a minute.
            It may find nothing — that is a real result, not a failure.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              // Radix composes AlertDialogAction's close with checkForDefaultPrevented,
              // so preventDefault here stops it auto-closing before the async work runs.
              // We close it ourselves once we know the outcome.
              e.preventDefault();
              startTransition(async () => {
                const res = await triggerAgentRun(thesisId, "challenge");
                if (res.ok) {
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(res.error);
                  setOpen(false);
                }
              });
            }}
          >
            Run challenge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
