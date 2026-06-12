import type { ClaimCategory } from "@/schemas/thesis";
import { CATEGORY_LABELS } from "@/lib/theses/labels";

export function CategoryBadge({ category }: { category: ClaimCategory }) {
  return (
    <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
