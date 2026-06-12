"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { THESIS_STATUSES, type ThesisStatus } from "@/schemas/thesis";
import { STATUS_LABELS } from "@/lib/theses/labels";
import { updateThesis } from "@/app/(app)/theses/actions";

export function StatusSelect({ thesisId, status }: { thesisId: string; status: ThesisStatus }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(v) =>
        startTransition(async () => {
          const res = await updateThesis(thesisId, { status: v as ThesisStatus });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="h-7 w-28 border-none px-2 text-sm font-medium shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THESIS_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
