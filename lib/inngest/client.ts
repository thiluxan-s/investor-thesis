import { Inngest } from "inngest";
import type { AgentRunMode } from "@/schemas/agent";

export type AgentRunRequested = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string; mode?: AgentRunMode };
};

export type AgentRunCompleted = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string; batchId?: string; mode?: AgentRunMode };
};

export type ScheduledRunsRequested = {
  data: { weekOf: string; userId?: string };
};

export type DigestRequested = {
  data: { userId: string; batchId: string; scenario?: string };
};

export const inngest = new Inngest({ id: "thesis-tracker" });
