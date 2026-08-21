import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";

export type CitationSource = {
  evidenceId: string;
  agentRunId: string;
  title: string;
  domain: string;
};

export type ResolvedCitation =
  | { kind: "this-run"; evidenceId: string; title: string; domain: string }
  | { kind: "earlier-run"; evidenceId: string; agentRunId: string; title: string; domain: string };

export type ResolvedPoint = {
  claimId: string;
  // The persisted snapshot of claims.ordinal at brief-write time. This is not
  // display data — see claimNumber below — and is kept only for provenance.
  claimOrdinal: number;
  // null when the claim was deleted after the brief was written. The argument
  // still stands on its own, so the point is kept and rendered without a statement.
  claimStatement: string | null;
  // Display number, 1-based by the claim's array position in the thesis's
  // current claim list — not derived from claimOrdinal. deleteClaim does not
  // renumber survivors, so ordinals can have gaps (e.g. [0, 2, 3]) while every
  // other surface (lib/agent/evidence-verdicts.ts) labels claims by position.
  // Rendering `claimOrdinal + 1` here would disagree with those surfaces on
  // the same page. Null exactly when claimStatement is null: the claim was
  // deleted after the brief was written, so no current position exists.
  claimNumber: number | null;
  argument: string;
  citations: ResolvedCitation[];
};

// The brief argues from the thesis's STANDING weakening evidence, not just this
// run's, so a cited item may predate this run entirely. Evidence in this run
// anchors to its card; older evidence links out to the run that found it; an id
// that resolves to nothing is dropped, because a brief must never render a dead
// anchor. Provenance is read off the evidence source itself
// (`source.agentRunId === thisRunId`), not from a separately supplied set, so a
// citation cannot be mislabeled by a caller whose two views of "which run" drift
// out of sync.
export function resolveBriefCitations(
  points: ChallengeBriefPoint[],
  thisRunId: string,
  known: ReadonlyMap<string, CitationSource>,
  claimsById: ReadonlyMap<string, { statement: string; displayNumber: number }>,
): ResolvedPoint[] {
  return points.map((point) => {
    const citations: ResolvedCitation[] = [];
    for (const evidenceId of point.evidenceIds) {
      const source = known.get(evidenceId);
      if (!source) continue;
      citations.push(
        source.agentRunId === thisRunId
          ? { kind: "this-run", evidenceId, title: source.title, domain: source.domain }
          : {
              kind: "earlier-run",
              evidenceId,
              agentRunId: source.agentRunId,
              title: source.title,
              domain: source.domain,
            },
      );
    }
    const claim = claimsById.get(point.claimId);
    return {
      claimId: point.claimId,
      claimOrdinal: point.claimOrdinal,
      claimStatement: claim?.statement ?? null,
      claimNumber: claim?.displayNumber ?? null,
      argument: point.argument,
      citations,
    };
  });
}
