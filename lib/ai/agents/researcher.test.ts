import { describe, it, expect, vi } from "vitest";
import { runResearcher, type ResearcherDeps } from "./researcher";

type MockMessage = { content: unknown[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };

function textMsg(): MockMessage {
  return { content: [{ type: "text", text: "thinking..." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
}
function toolMsg(name: string, input: unknown): MockMessage {
  return { content: [{ type: "tool_use", id: "tu_1", name, input }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 } };
}
function returnResultMsg(evidence: unknown[]): MockMessage {
  return toolMsg("return_result", { evidence });
}

function deps(responses: MockMessage[], overrides: Partial<ResearcherDeps> = {}): ResearcherDeps {
  const persist = {
    appendIteration: vi.fn().mockResolvedValue(undefined),
    persistEvidence: vi.fn().mockResolvedValue(undefined),
  };
  let i = 0;
  return {
    client: { createMessage: vi.fn().mockImplementation(async () => responses[i++]) },
    toolContext: { search: { search: vi.fn() }, fetcher: vi.fn(), edgarClient: vi.fn(), useFixtures: false },
    persist,
    maxIterations: 12,
    maxTokens: 100_000,
    ...overrides,
  };
}

const thesis = { title: "T", ticker: "NVDA", positionDirection: "long", timeHorizon: "months" };
const claims = [{ statement: "Revenue grows" }];

describe("runResearcher", () => {
  it("completes when the agent calls return_result and persists evidence", async () => {
    const d = deps([returnResultMsg([{ source_url: "https://reuters.com/a", title: "T", snippet: "s", claim_indices: [0], extracted_text: "txt" }])]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("complete");
    expect(d.persist.persistEvidence).toHaveBeenCalledTimes(1);
    expect(d.persist.appendIteration).toHaveBeenCalled();
  });

  it("completes with no evidence on a bare end_turn", async () => {
    const d = deps([textMsg()]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("complete");
    expect(d.persist.persistEvidence).not.toHaveBeenCalled();
  });

  it("stops as partial when the iteration cap is hit", async () => {
    const many = Array.from({ length: 13 }, () => toolMsg("web_search", { query: "x" }));
    const d = deps(many);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("partial");
    expect(d.client.createMessage).toHaveBeenCalledTimes(12);
  });

  it("fails on an unexpected stop_reason", async () => {
    const d = deps([{ content: [], stop_reason: "max_tokens", usage: { input_tokens: 1, output_tokens: 1 } }]);
    const res = await runResearcher(thesis, claims, [], d, "test");
    expect(res.status).toBe("failed");
  });

  it("uses the toolRunner override when provided", async () => {
    const toolRunner = vi.fn().mockResolvedValue({ ok: true, output: { results: [] } });
    const d = deps([toolMsg("web_search", { query: "x" }), returnResultMsg([])], { toolRunner });
    await runResearcher(thesis, claims, [], d, "test");
    expect(toolRunner).toHaveBeenCalledWith("web_search", { query: "x" }, d.toolContext);
  });
});
