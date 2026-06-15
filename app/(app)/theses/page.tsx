import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/require-user";
import { listThesesByUser } from "@/lib/db/repositories/theses";
import { lastAnalyzedByThesisIds } from "@/lib/db/repositories/agent-runs";
import { ThesisRow } from "@/components/theses/ThesisRow";

export default async function ThesesPage() {
  const userId = await requireUserId();
  const theses = await listThesesByUser(userId);
  const lastAnalyzed = await lastAnalyzedByThesisIds(theses.map((t) => t.id));

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Your theses</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {theses.length === 0
              ? "Positions you're tracking. The agent watches each one for new evidence."
              : `${theses.length} ${theses.length === 1 ? "position" : "positions"} tracked`}
          </p>
        </div>
        <Button asChild>
          <Link href="/theses/new">New thesis</Link>
        </Button>
      </div>

      {theses.length === 0 ? (
        <div className="mt-14 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 px-6 py-20 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
            <span className="size-4 rounded-[4px] bg-primary/15 ring-1 ring-inset ring-primary/30" />
          </div>
          <p className="mt-5 font-medium text-zinc-900">No theses yet</p>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
            Write a position and a few claims, and the agent takes it from there.
          </p>
          <Button asChild className="mt-6">
            <Link href="/theses/new">Create your first thesis</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 border-t border-zinc-200">
          {theses.map((t) => (
            <ThesisRow key={t.id} thesis={t} lastAnalyzed={lastAnalyzed.get(t.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
