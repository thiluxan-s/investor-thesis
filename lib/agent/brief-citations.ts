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
  claimOrdinal: number;
  // null when the claim was deleted after the brief was written. The argument
  // still stands on its own, so the point is kept and rendered without a statement.
  claimStatement: string | null;
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
  claimsById: ReadonlyMap<string, { statement: string }>,
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
    return {
      claimId: point.claimId,
      claimOrdinal: point.claimOrdinal,
      claimStatement: claimsById.get(point.claimId)?.statement ?? null,
      argument: point.argument,
      citations,
    };
  });
}
