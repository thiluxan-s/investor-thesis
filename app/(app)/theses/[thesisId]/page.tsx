import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listAgentRunsForThesis } from "@/lib/db/repositories/agent-runs";
import { isTerminalStatus } from "@/lib/agent/run-status";
import { DIRECTION_LABELS, HORIZON_LABELS } from "@/lib/theses/labels";
import { ClaimList } from "@/components/theses/ClaimList";
import { StatusSelect } from "@/components/theses/StatusSelect";
import { NotesEditor } from "@/components/theses/NotesEditor";
import { DeleteThesisButton } from "@/components/theses/DeleteThesisButton";
import { AnalyzeNowButton } from "@/components/agent/AnalyzeNowButton";
import { AgentRunPanel } from "@/components/agent/AgentRunPanel";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { HealthChart } from "@/components/theses/HealthChart";
import { HealthBar } from "@/components/agent/HealthBar";
import { thesisHealth } from "@/lib/health/score";

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) notFound();

  const runs = await listAgentRunsForThesis(userId, thesis.id);
  const activeRun = runs.find((r) => !isTerminalStatus(r.status));

  const snapshots = await listSnapshotsForThesis(thesis.id);
  const chartPoints = snapshots
    .map((s) => ({ recordedAt: s.recordedAt.toISOString(), score: Number(s.overallScore) }))
    .reverse(); // listSnapshotsForThesis is newest-first; chart wants oldest→newest

  // Thesis-level current health: mean of the claims' scores, shown only once any
  // claim has been analyzed (matches the unanalyzed placeholder convention).
  const analyzed = thesis.claims.some((c) => c.currentHealthUpdatedAt !== null);
  const thesisScore = thesisHealth(thesis.claims.map((c) => Number(c.currentHealthScore)));

  const dirClass = thesis.positionDirection === "long" ? "text-[#1F7A4D]" : "text-[#C0492F]";

  return (
    <div>
      <Link href="/theses" className="text-xs text-zinc-400 hover:text-zinc-600">
        Theses / {thesis.ticker}
      </Link>

      <div className="mt-3.5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{thesis.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-600">
              {thesis.ticker}
            </span>
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${dirClass}`}>
              {DIRECTION_LABELS[thesis.positionDirection]}
            </span>
            <span className="text-xs text-zinc-400">· {HORIZON_LABELS[thesis.timeHorizon]}</span>
          </div>
        </div>
        <AnalyzeNowButton thesisId={thesis.id} disabled={Boolean(activeRun)} />
      </div>

      <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
        <div>
          <ClaimList thesisId={thesis.id} claims={thesis.claims} />

          <div className="mt-10 border-t border-zinc-100 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Thesis health</p>
              <HealthBar score={thesisScore} analyzed={analyzed} trackClassName="w-28" />
            </div>
            <HealthChart points={chartPoints} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 p-4 text-sm">
            <Row k="Ticker"><span className="font-mono">{thesis.ticker}</span></Row>
            <Row k="Position">{DIRECTION_LABELS[thesis.positionDirection]}</Row>
            <Row k="Horizon">{HORIZON_LABELS[thesis.timeHorizon]}</Row>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-zinc-400">Status</span>
              <StatusSelect thesisId={thesis.id} status={thesis.status} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Notes</p>
            <NotesEditor thesisId={thesis.id} notes={thesis.notes} />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis</p>
            <AgentRunPanel thesisId={thesis.id} runs={runs} />
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <DeleteThesisButton thesisId={thesis.id} title={thesis.title} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-1.5 last:border-none">
      <span className="text-zinc-400">{k}</span>
      <span className="font-medium text-zinc-700">{children}</span>
    </div>
  );
}
