import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-sm text-zinc-600">
        You&apos;re viewing a <span className="font-medium text-zinc-800">live demo thesis</span> — read-only.
      </p>
      <Button asChild size="sm">
        <Link href="/sign-up">Sign up to track your own</Link>
      </Button>
    </div>
  );
}
