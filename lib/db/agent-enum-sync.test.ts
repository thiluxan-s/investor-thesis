import { describe, it, expect } from "vitest";
import { AGENT_RUN_STATUSES, AGENT_RUN_TRIGGERS } from "@/schemas/agent";
import { agentRunStatus, agentRunTrigger } from "@/lib/db/schema";

describe("agent enum tuples stay in sync with pgEnums", () => {
  it("agent_run_status", () => {
    expect([...agentRunStatus.enumValues]).toEqual([...AGENT_RUN_STATUSES]);
  });
  it("agent_run_trigger", () => {
    expect([...agentRunTrigger.enumValues]).toEqual([...AGENT_RUN_TRIGGERS]);
  });
});
