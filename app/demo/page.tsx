import Link from "next/link";
import { getDemoThesis, getDemoRuns } from "@/lib/demo/queries";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { DIRECTION_LABELS, HORIZON_LABELS } from "@/lib/theses/labels";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { thesisHealth } from "@/lib/health/score";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoClaimList } from "@/components/demo/DemoClaimList";
import { HealthBar } from "@/components/agent/HealthBar";
import { HealthChart } from "@/components/theses/HealthChart";

export default async function DemoPage() {
  const thesis = await getDemoThesis();
  if (!thesis) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
        The demo isn&apos;t available right now.{" "}
        <Link className="text-primary" href="/sign-up">
          Sign up
        </Link>{" "}
        to create your own thesis.
      </div>
    );
  }
  const runs = await getDemoRuns();
  const snapshots = await listSnapshotsForThesis(thesis.id);
  const chartPoints = snapshots
    .map((s) => ({ recordedAt: s.recordedAt.toISOString(), score: Number(s.overallScore) }))
    .reverse();
  const analyzed = thesis.claims.some((c) => c.currentHealthUpdatedAt !== null);
  const thesisScore = thesisHealth(thesis.claims.map((c) => Number(c.currentHealthScore)));
  const lastAnalyzed = runs
    .filter((r) => isTerminalStatus(r.status) && r.completedAt)
    .reduce<Date | null>((acc, r) => {
      const c = r.completedAt as Date;
      return !acc || c > acc ? c : acc;
    }, null);
  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <DemoBanner />
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{thesis.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">
          {thesis.ticker}
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>
          {DIRECTION_LABELS[thesis.positionDirection]}
        </span>
        <span className="text-xs text-zinc-400">· {HORIZON_LABELS[thesis.timeHorizon]}</span>
        <span className="text-xs text-zinc-400">
          · {lastAnalyzed ? `Analyzed ${formatRelativeTime(lastAnalyzed)}` : "Not analyzed"}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
        <div>
          <DemoClaimList claims={thesis.claims} />
          <div className="mt-10 border-t border-zinc-100 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Thesis health</p>
              <HealthBar score={thesisScore} analyzed={analyzed} trackClassName="w-28" />
            </div>
            <HealthChart points={chartPoints} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis runs</p>
          {runs.length === 0 && <p className="text-xs text-zinc-400">No runs yet.</p>}
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/demo/runs/${r.id}`}
              className="block rounded-lg border border-zinc-200 px-3 py-2.5 text-sm hover:bg-zinc-50"
            >
              <span className="font-medium text-zinc-800">View agent run →</span>
              <span className="mt-0.5 block font-mono text-[11px] text-zinc-400">
                {r.iterationsUsed} iters · {r.evidenceCollected} evidence
                {r.completedAt ? ` · ${formatRelativeTime(r.completedAt)}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
