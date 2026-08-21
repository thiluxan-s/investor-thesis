import "server-only";
import { getBriefForRun } from "@/lib/db/repositories/challenge-briefs";
import { listEvidenceByIds } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import {
  resolveBriefCitations,
  type CitationSource,
  type ResolvedPoint,
} from "@/lib/agent/brief-citations";
import { PersistedChallengeBriefPointsSchema } from "@/lib/ai/schemas/challenge-brief";
import type { Claim, Evidence, Source } from "@/lib/db/schema";

export type TraceBrief = {
  // True when a challenge_briefs row exists for this run, even if its points
  // failed validation. Callers need this separately from `brief`: a malformed
  // brief must suppress the "no counter-evidence found" state too, because
  // claiming the thesis held up while unrenderable counter-evidence exists
  // would be false.
  hasRow: boolean;
  // Renderable brief. Null when there is no row, or its points are malformed.
  brief: { headline: string; summary: string; points: ResolvedPoint[] } | null;
};

// A brief argues from the thesis's STANDING weakening evidence, so some cited
// items belong to earlier runs and have no card in this trace. Those are
// resolved here too, so the brief never renders a dead anchor.
export async function loadTraceBrief(input: {
  runId: string;
  claims: Claim[];
  runEvidence: Evidence[];
  sourcesById: Map<string, Source>;
}): Promise<TraceBrief> {
  const raw = await getBriefForRun(input.runId);
  if (!raw) return { hasRow: false, brief: null };

  // points is JSONB — a row written by an older or future promptVersion could be
  // shaped differently (e.g. missing evidenceIds). Validate rather than cast: a
  // malformed brief must never 500 the app's most important screen.
  const parsed = PersistedChallengeBriefPointsSchema.safeParse(raw.points);
  if (!parsed.success) return { hasRow: true, brief: null };

  const points = parsed.data;
  const citedIds = [...new Set(points.flatMap((p) => p.evidenceIds))];
  const thisRunEvidenceIds = new Set(input.runEvidence.map((e) => e.id));
  const foreignEvidence = await listEvidenceByIds(
    citedIds.filter((id) => !thisRunEvidenceIds.has(id)),
  );
  const foreignSources = await getSourcesByIds([
    ...new Set(foreignEvidence.map((e) => e.sourceId)),
  ]);
  const foreignSourceById = new Map(foreignSources.map((s) => [s.id, s]));

  const known = new Map<string, CitationSource>();
  const remember = (e: Evidence, src: Source | undefined) => {
    if (!src) return;
    known.set(e.id, {
      evidenceId: e.id,
      agentRunId: e.agentRunId,
      title: src.title ?? src.domain,
      domain: src.domain,
    });
  };
  for (const e of input.runEvidence) remember(e, input.sourcesById.get(e.sourceId));
  for (const e of foreignEvidence) remember(e, foreignSourceById.get(e.sourceId));

  return {
    hasRow: true,
    brief: {
      headline: raw.headline,
      summary: raw.summary,
      points: resolveBriefCitations(
        points,
        input.runId,
        known,
        new Map(input.claims.map((c, i) => [c.id, { statement: c.statement, displayNumber: i + 1 }])),
      ),
    },
  };
}
