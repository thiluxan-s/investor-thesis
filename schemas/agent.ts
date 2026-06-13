// Enum value tuples — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here (zod only). The drift-guard test asserts they match.
export const AGENT_RUN_STATUSES = ["queued", "running", "complete", "partial", "failed"] as const;
export const AGENT_RUN_TRIGGERS = ["manual", "scheduled"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunTrigger = (typeof AGENT_RUN_TRIGGERS)[number];
