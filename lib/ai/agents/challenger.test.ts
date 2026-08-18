import { describe, it, expect, vi } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { buildChallengeBriefTask } from "@/lib/ai/prompts/challenger";
import { writeChallengeBrief, type BriefEvidenceItem } from "./challenger";

function clientReturning(input: unknown): AnthropicLike {
  return {
    createMessage: vi.fn(async () =>
      ({
        content: [{ type: "tool_use", name: "return_challenge_brief", id: "t1", input }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }) as unknown as Anthropic.Message,
    ),
  };
}

const thesis = { title: "Long NVDA", ticker: "NVDA", positionDirection: "long", timeHorizon: "months" };
const claims = [
  { id: "claim-a", ordinal: 0, statement: "Data-center revenue keeps growing" },
  { id: "claim-b", ordinal: 1, statement: "CUDA is a durable moat" },
];
const items: BriefEvidenceItem[] = [
  { evidenceId: "ev-1", claimId: "claim-a", claimOrdinal: 0, extractedText: "Orders slipped.", confidence: 0.7, ageDays: 5 },
  { evidenceId: "ev-2", claimId: "claim-b", claimOrdinal: 1, extractedText: "Rival toolkit shipped.", confidence: 0.6, ageDays: 12 },
];

const good = {
  headline: "Order slippage undercuts the growth claim",
  summary: "Two sources point at softening demand.",
  points: [{ claim_index: 0, argument: "Orders slipped this quarter.", evidence_indices: [0] }],
};

describe("writeChallengeBrief", () => {
  it("resolves indices to claim and evidence ids", async () => {
    const client = clientReturning(good);
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res).not.toBeNull();
    expect(res!.headline).toBe(good.headline);
    expect(res!.points).toEqual([
      { claimId: "claim-a", claimOrdinal: 0, argument: "Orders slipped this quarter.", evidenceIds: ["ev-1"] },
    ]);
  });

  it("forces the tool, disables thinking, and uses the evaluator model", async () => {
    const client = clientReturning(good);
    await writeChallengeBrief(thesis, claims, items, { client });
    const call = (client.createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.toolChoice).toEqual({ type: "tool", name: "return_challenge_brief" });
    expect(call.thinking).toBe(false);
    expect(call.model).toBe("claude-sonnet-4-6");
  });

  it("drops an out-of-range evidence index but keeps the point", async () => {
    const client = clientReturning({
      ...good,
      points: [{ claim_index: 0, argument: "Orders slipped.", evidence_indices: [0, 99] }],
    });
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res!.points[0].evidenceIds).toEqual(["ev-1"]);
  });

  it("drops a point whose claim index is out of range", async () => {
    const client = clientReturning({
      ...good,
      points: [
        { claim_index: 0, argument: "Kept.", evidence_indices: [0] },
        { claim_index: 9, argument: "Dropped.", evidence_indices: [1] },
      ],
    });
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res!.points).toHaveLength(1);
    expect(res!.points[0].argument).toBe("Kept.");
  });

  it("returns null when a point's evidence indices all fail to resolve", async () => {
    const client = clientReturning({
      ...good,
      points: [{ claim_index: 0, argument: "No citable evidence.", evidence_indices: [99] }],
    });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("drops an evidence-less point while keeping a good one", async () => {
    const client = clientReturning({
      ...good,
      points: [
        { claim_index: 0, argument: "Kept.", evidence_indices: [0] },
        { claim_index: 1, argument: "No citable evidence.", evidence_indices: [99] },
      ],
    });
    const res = await writeChallengeBrief(thesis, claims, items, { client });
    expect(res!.points).toHaveLength(1);
    expect(res!.points[0].argument).toBe("Kept.");
  });

  it("returns null when the model output fails validation", async () => {
    const client = clientReturning({ headline: "", summary: "x", points: [] });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("returns null when every point is dropped", async () => {
    const client = clientReturning({
      ...good,
      points: [{ claim_index: 42, argument: "Dropped.", evidence_indices: [0] }],
    });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("returns null when the model returns no points at all", async () => {
    const client = clientReturning({ ...good, points: [] });
    expect(await writeChallengeBrief(thesis, claims, items, { client })).toBeNull();
  });

  it("numbers evidence claim references by list position, not raw ordinal", () => {
    const gappedClaims = [
      { id: "claim-a", ordinal: 0, statement: "First" },
      { id: "claim-c", ordinal: 2, statement: "Third" },
    ];
    const gappedItems = [
      { evidenceId: "ev-1", claimId: "claim-c", claimOrdinal: 2, extractedText: "text", confidence: 0.5, ageDays: 3 },
    ];
    const task = buildChallengeBriefTask(thesis, gappedClaims, gappedItems);
    expect(task).toContain("weakens claim 1");
    expect(task).not.toContain("weakens claim 2");
  });
});
