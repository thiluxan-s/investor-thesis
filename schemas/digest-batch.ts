// Enum value tuple — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here. The drift-guard test asserts they match.
export const DIGEST_BATCH_STATUSES = ["pending", "sending", "sent", "skipped"] as const;
export type DigestBatchStatus = (typeof DIGEST_BATCH_STATUSES)[number];
