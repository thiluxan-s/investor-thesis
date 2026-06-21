"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
        <span className="size-4 rounded-[4px] bg-[#C0492F]/15 ring-1 ring-inset ring-[#C0492F]/30" />
      </div>
      <p className="mt-5 font-medium text-zinc-900">Something went wrong</p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
        That page hit an unexpected error. You can try again, or head back to your theses.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/theses">Back to theses</Link>
        </Button>
      </div>
    </div>
  );
}
