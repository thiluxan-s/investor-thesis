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
export type ChallengeBriefPoint = {
  claimId: string;
  claimOrdinal: number;
  argument: string;
  evidenceIds: string[];
};
