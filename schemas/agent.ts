import { z } from "zod";

// Enum value tuples — duplicated in lib/db/schema.ts (pgEnum); kept client-safe
// here (zod only). The drift-guard test asserts they match.
export const AGENT_RUN_STATUSES = ["queued", "running", "complete", "partial", "failed"] as const;
export const AGENT_RUN_TRIGGERS = ["manual", "scheduled"] as const;
export const AGENT_RUN_MODES = ["research", "challenge"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunTrigger = (typeof AGENT_RUN_TRIGGERS)[number];
export type AgentRunMode = (typeof AGENT_RUN_MODES)[number];

export const AgentRunModeSchema = z.enum(AGENT_RUN_MODES);

export const FORM_TYPES = ["10-K", "10-Q", "8-K"] as const;

export const WebSearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

export const WebFetchInputSchema = z.object({
  url: z.string().url(),
});

export const EdgarInputSchema = z.object({
  ticker: z.string().min(1),
  formType: z.enum(FORM_TYPES).optional(),
});

export const EvidenceItemSchema = z.object({
  source_url: z.string().url(),
  title: z.string().min(1),
  snippet: z.string().min(1),
  claim_indices: z.array(z.number().int().min(0)),
  extracted_text: z.string().min(1),
});

export const ReturnResultSchema = z.object({
  evidence: z.array(EvidenceItemSchema),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
export type EdgarInput = z.infer<typeof EdgarInputSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
