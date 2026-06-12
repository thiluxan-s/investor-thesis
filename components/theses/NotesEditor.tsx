"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateThesis } from "@/app/(app)/theses/actions";

export function NotesEditor({ thesisId, notes }: { thesisId: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return notes ? (
      <p className="text-sm leading-relaxed text-zinc-600" onClick={() => setEditing(true)}>
        {notes}
      </p>
    ) : (
      <button type="button" className="text-sm text-zinc-400 hover:text-zinc-600" onClick={() => setEditing(true)}>
        + Add notes
      </button>
    );
  }

  return (
    <div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="resize-none" />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateThesis(thesisId, { notes: value.trim() });
              if (res.ok) setEditing(false);
              else toast.error(res.error);
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(notes ?? ""); setEditing(false); }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
