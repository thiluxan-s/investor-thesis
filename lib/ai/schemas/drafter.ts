import { z } from "zod";
import { CLAIM_CATEGORIES } from "@/schemas/thesis";

// Lenient on length: the user edits before saving, and CreateThesisSchema
// enforces the real 10–300 / 2–5 constraints at save time.
export const DraftedClaimSchema = z.object({
  statement: z.string().min(1).max(500),
  category: z.enum(CLAIM_CATEGORIES),
  sourceExcerpt: z.string(), // verbatim substring of the user's paragraph; may be ""
});

export const DraftedClaimsSchema = z.object({
  claims: z.array(DraftedClaimSchema),
});

export type DraftedClaim = z.infer<typeof DraftedClaimSchema>;
export type DraftedClaims = z.infer<typeof DraftedClaimsSchema>;
