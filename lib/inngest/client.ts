import { Inngest } from "inngest";

export type AgentRunRequested = {
  data: { agentRunId: string; thesisId: string; userId: string; scenario?: string };
};

export const inngest = new Inngest({ id: "thesis-tracker" });
