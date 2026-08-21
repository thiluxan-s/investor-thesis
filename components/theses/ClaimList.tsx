"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClaimForm } from "@/components/theses/ClaimForm";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { HealthBar } from "@/components/agent/HealthBar";
import type { Claim } from "@/lib/db/schema";
import type { ClaimCategory, ClaimInput } from "@/schemas/thesis";
import { MAX_CLAIMS } from "@/lib/theses/claim-invariants";
import { addClaim, updateClaim, deleteClaim, type ActionResult } from "@/app/(app)/theses/actions";

export function ClaimList({ thesisId, claims }: { thesisId: string; claims: Claim[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk?.();
      else toast.error(res.error);
    });
  }

  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Claims · {claims.length}
      </p>

      {claims.map((c, idx) =>
        editingId === c.id ? (
          <div key={c.id} className="py-3.5">
            <ClaimForm
              initial={{ statement: c.statement, category: c.category as ClaimCategory }}
              submitLabel="Save"
              pending={pending}
              onCancel={() => setEditingId(null)}
              onSubmit={(input: ClaimInput) =>
                run(() => updateClaim(thesisId, c.id, input), () => setEditingId(null))
              }
            />
          </div>
        ) : (
          <div key={c.id} className="border-b border-zinc-100 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-zinc-400">{idx + 1}</span>
                <CategoryBadge category={c.category as ClaimCategory} />
              </div>
              <HealthBar
                score={Number(c.currentHealthScore)}
                analyzed={c.currentHealthUpdatedAt !== null}
                trackClassName="w-20"
              />
            </div>
            <Link
              href={`/theses/${thesisId}/claims/${c.id}`}
              className="mt-1.5 block text-sm leading-relaxed text-zinc-800 underline-offset-2 hover:text-primary hover:underline"
            >
              {c.statement}
            </Link>
            <div className="mt-1.5 flex gap-3.5 text-xs text-zinc-400">
              <button type="button" className="hover:text-zinc-700" onClick={() => setEditingId(c.id)}>
                Edit
              </button>
              <button
                type="button"
                className="hover:text-[#C0492F]"
                disabled={pending}
                onClick={() => run(() => deleteClaim(thesisId, c.id))}
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <div className="py-3.5">
          <ClaimForm
            submitLabel="Add claim"
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) => run(() => addClaim(thesisId, input), () => setAdding(false))}
          />
        </div>
      ) : claims.length < MAX_CLAIMS ? (
        <Button variant="ghost" size="sm" className="mt-3 px-0 text-primary" onClick={() => setAdding(true)}>
          + Add claim
        </Button>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">Maximum of {MAX_CLAIMS} claims.</p>
      )}
    </div>
  );
}
