import Link from "next/link";
import { formatRelativeTime } from "@/lib/format/relative-time";

// A bookmark, not a second copy. The run trace owns the full argument; five
// points repeated here would fight the thesis page's density. The caller
// renders nothing at all when the thesis has no brief — an absence needs no
// announcement.
export function LatestChallengeBrief({
  headline,
  agentRunId,
  createdAt,
  runHrefBase,
}: {
  headline: string;
  agentRunId: string;
  createdAt: Date;
  // Path prefix for run links, without a trailing slash.
  runHrefBase: string;
}) {
  return (
    <Link
      href={`${runHrefBase}/${agentRunId}`}
      className="block rounded-xl border border-zinc-200 bg-challenge-panel px-4 py-3.5 transition-colors hover:border-zinc-300"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-challenge-foreground">
        The case against
      </p>
      <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-900">{headline}</p>
      <p className="mt-2 text-[11px] text-zinc-400">
        {formatRelativeTime(createdAt)} · View the full case →
      </p>
    </Link>
  );
}
