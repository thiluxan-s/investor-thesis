import Link from "next/link";
import type { ThesisListItem } from "@/lib/db/repositories/theses";
import { DIRECTION_LABELS, HORIZON_LABELS, STATUS_LABELS } from "@/lib/theses/labels";

export function ThesisRow({ thesis }: { thesis: ThesisListItem }) {
  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";
  const statusClass =
    thesis.status === "active"
      ? "bg-[#eef2f6] text-primary"
      : "bg-zinc-100 text-zinc-500";
  return (
    <Link
      href={`/theses/${thesis.id}`}
      className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-zinc-100 px-2 py-4 hover:bg-zinc-50/70"
    >
      <div>
        <div className="flex items-center gap-3">
          <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">
            {thesis.ticker}
          </span>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>
            {DIRECTION_LABELS[thesis.positionDirection]}
          </span>
          <span className="text-sm font-medium text-zinc-900">{thesis.title}</span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-400">
          {thesis.claimCount} {thesis.claimCount === 1 ? "claim" : "claims"} ·{" "}
          {HORIZON_LABELS[thesis.timeHorizon]}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="h-1.5 w-20 rounded-full border border-dashed border-zinc-300" />
        Not analyzed yet
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}>
        {STATUS_LABELS[thesis.status]}
      </span>
    </Link>
  );
}
