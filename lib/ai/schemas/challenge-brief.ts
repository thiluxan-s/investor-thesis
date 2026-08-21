import { z } from "zod";

// What the model returns. Indices are zero-based into the ordinal-ordered claim
// list and the numbered evidence list supplied in the task — the same convention
// the researcher already uses for claim_indices. Asking the model to echo UUIDs
// is error-prone and bloats the payload.
export const ChallengeBriefPointSchema = z.object({
  claim_index: z.number().int().min(0),
  argument: z.string().min(1),
  evidence_indices: z.array(z.number().int().min(0)),
});

export const ChallengeBriefSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1),
  points: z.array(ChallengeBriefPointSchema).max(5),
});

export type ChallengeBriefOutput = z.infer<typeof ChallengeBriefSchema>;

// What we persist to challenge_briefs.points, after resolving indices to ids.
// challenge_briefs.points is JSONB, so a row written by an older or future
// promptVersion could be missing a field (e.g. no evidenceIds) — validate at
// the read boundary rather than trusting the cast, since the trace page must
// never crash rendering a brief.
export const PersistedChallengeBriefPointSchema = z.object({
  claimId: z.string().min(1),
  claimOrdinal: z.number().int().min(0),
  argument: z.string().min(1),
  evidenceIds: z.array(z.string()),
});

export const PersistedChallengeBriefPointsSchema = z.array(PersistedChallengeBriefPointSchema);

export type ChallengeBriefPoint = z.infer<typeof PersistedChallengeBriefPointSchema>;
