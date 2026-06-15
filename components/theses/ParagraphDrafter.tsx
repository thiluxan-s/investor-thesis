"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import { draftClaimsFromParagraph } from "@/app/(app)/theses/agent-actions";
import type { DraftedClaim } from "@/lib/ai/schemas/drafter";
import type { ClaimInput, PositionDirection } from "@/schemas/thesis";

export function ParagraphDrafter({
  ticker,
  positionDirection,
  onAdd,
  canAdd,
}: {
  ticker: string;
  positionDirection: PositionDirection;
  onAdd: (claim: ClaimInput) => void;
  canAdd: boolean;
}) {
  const [reasoning, setReasoning] = useState("");
  const [drafted, setDrafted] = useState<DraftedClaim[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  function draft() {
    startTransition(async () => {
      const res = await draftClaimsFromParagraph({ ticker, positionDirection, reasoning });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDrafted(res.data.claims);
      setAdded(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={reasoning}
        onChange={(e) => setReasoning(e.target.value)}
        rows={5}
        maxLength={2000}
        placeholder="Paste or write your reasoning. e.g. 'Data-center demand keeps climbing, no one is close on the software stack, and the big clouds keep spending…'"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">{reasoning.trim().length}/2000 · at least 30 characters</p>
        <Button size="sm" disabled={pending || reasoning.trim().length < 30} onClick={draft}>
          {pending ? "Drafting…" : "Draft claims"}
        </Button>
      </div>

      {drafted && drafted.length === 0 && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
          Couldn&apos;t draft claims from that — add more detail, or write them manually.
        </p>
      )}

      {drafted && drafted.length > 0 && (
        <div className="space-y-2">
          {drafted.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.05 }}
              className="rounded-xl border border-zinc-100 bg-white px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CategoryBadge category={c.category} />
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
                  {c.sourceExcerpt && (
                    <p className="mt-1 text-[11px] italic text-zinc-400">from: “{c.sourceExcerpt}”</p>
                  )}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={added.has(i) || !canAdd}
                  onClick={() => {
                    onAdd({ statement: c.statement, category: c.category });
                    setAdded((prev) => new Set(prev).add(i));
                  }}
                >
                  {added.has(i) ? "Added" : "Add"}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
