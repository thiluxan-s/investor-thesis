"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLAIM_CATEGORIES, type ClaimCategory, type ClaimInput } from "@/schemas/thesis";
import { CATEGORY_LABELS } from "@/lib/theses/labels";

type Props = {
  initial?: ClaimInput;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (input: ClaimInput) => void;
  onCancel?: () => void;
};

export function ClaimForm({ initial, submitLabel, pending, onSubmit, onCancel }: Props) {
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [category, setCategory] = useState<ClaimCategory>(initial?.category ?? "financial_performance");
  const trimmed = statement.trim();
  const valid = trimmed.length >= 10 && trimmed.length <= 300;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5">
      <Textarea
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        rows={2}
        placeholder="A falsifiable statement the agent will hunt evidence for…"
        className="resize-none bg-white"
      />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v as ClaimCategory)}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLAIM_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!valid || pending}
            onClick={() => onSubmit({ statement: trimmed, category })}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">{trimmed.length}/300 · min 10 characters</p>
    </div>
  );
}
