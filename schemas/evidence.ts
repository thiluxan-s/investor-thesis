// Enum value tuple — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here (no server imports). The drift-guard test asserts they match.
export const EVIDENCE_IMPACTS = ["strengthens", "neutral", "weakens"] as const;
export type EvidenceImpact = (typeof EVIDENCE_IMPACTS)[number];
