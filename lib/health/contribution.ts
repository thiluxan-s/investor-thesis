import type { EvidenceImpact } from "@/schemas/evidence";
import { decayWeight, impactValue } from "./score";

// One evidence link's share of a claim's health score.
//
// claimHealth is Σ(impactValue_i × w_i) / Σw, so a link's signed contribution
// impactValue_i × w_i / Σw sums EXACTLY to the claim's overall score. That is
// deliberately unlike the research/challenge split in claimHealthBreakdown,
// whose sub-scores are independent averages over different denominators and do
// not combine into the total. The UI leans on this difference, so keep the two
// straight.
//
// weightShare is tracked separately from contribution because a `neutral` link
// adds 0 to the numerator while still adding to the denominator: it dilutes the
// score toward zero. Showing contribution alone makes such a link look inert
// when it is doing real work, and "why isn't my score more extreme" is one of
// the questions this surface exists to answer.
export type Weighted<T> = T & {
  // confidence × decayWeight(age), unnormalized.
  weight: number;
  // weight / Σweight, in [0, 1]. Shares sum to 1 over any non-empty input.
  weightShare: number;
  // impactValue × weightShare. Contributions sum to claimHealth(links, now).
  contribution: number;
};

type ContributionInput = { impact: EvidenceImpact; confidence: number; createdAt: Date };

// Ranked by raw weight descending — NOT by |contribution|. A heavy `neutral`
// link is the reason a score is muted, so it belongs near the top; ranking by
// contribution magnitude would bury exactly the rows that explain the number.
// Ties keep input order (Array.sort is stable), which is cosmetic here since
// every row is rendered.
export function rankContributions<T extends ContributionInput>(
  links: T[],
  now: Date,
): Weighted<T>[] {
  const weights = links.map(
    (l) => l.confidence * decayWeight(now.getTime() - new Date(l.createdAt).getTime()),
  );
  const total = weights.reduce((acc, w) => acc + w, 0);
  return links
    .map((link, i) => {
      const weight = weights[i];
      // total is 0 when there are no links or every confidence is 0. Guard the
      // division rather than emitting NaN into the UI.
      const weightShare = total === 0 ? 0 : weight / total;
      return {
        ...link,
        weight,
        weightShare,
        contribution: impactValue(link.impact) * weightShare,
      };
    })
    .sort(
      (a, b) =>
        // Array.sort is stable, so an exact weight tie would otherwise fall back to
        // whatever order the database happened to return — the same instability
        // class fixed in selectBriefEvidence. This surface's whole job is
        // explaining an ordering, so break ties deterministically on createdAt
        // (newest first) instead of leaving it to query-plan luck.
        b.weight - a.weight || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}
