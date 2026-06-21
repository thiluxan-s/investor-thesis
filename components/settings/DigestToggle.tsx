"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setDigestEnabledAction } from "@/app/(app)/settings/actions";

export function DigestToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setDigestEnabledAction(next);
      if (!res.ok) {
        setEnabled(!next); // revert
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Weekly email digest"
      disabled={pending}
      onClick={toggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${
        enabled ? "bg-primary" : "bg-zinc-200"
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
