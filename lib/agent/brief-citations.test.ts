import { describe, it, expect } from "vitest";
import type { ChallengeBriefPoint } from "@/lib/ai/schemas/challenge-brief";
import { resolveBriefCitations, type CitationSource } from "./brief-citations";

const claimsById = new Map([
  ["claim-a", { statement: "Data-center revenue keeps growing" }],
  ["claim-b", { statement: "NVIDIA keeps its accelerator lead" }],
]);

const known = new Map<string, CitationSource>([
  ["ev-this", { evidenceId: "ev-this", agentRunId: "run-1", title: "Margins slipped", domain: "reuters.com" }],
  ["ev-old", { evidenceId: "ev-old", agentRunId: "run-0", title: "Rival shipped", domain: "sec.gov" }],
]);

function point(over: Partial<ChallengeBriefPoint> = {}): ChallengeBriefPoint {
  return { claimId: "claim-a", claimOrdinal: 0, argument: "Margins fell.", evidenceIds: ["ev-this"], ...over };
}

describe("resolveBriefCitations", () => {
  it("anchors evidence collected by this run", () => {
    const [resolved] = resolveBriefCitations([point()], "run-1", known, claimsById);
    expect(resolved.citations).toEqual([
      { kind: "this-run", evidenceId: "ev-this", title: "Margins slipped", domain: "reuters.com" },
    ]);
  });

  it("labels evidence from an earlier run and carries its run id", () => {
    const [resolved] = resolveBriefCitations([point({ evidenceIds: ["ev-old"] })], "run-1", known, claimsById);
    expect(resolved.citations).toEqual([
      { kind: "earlier-run", evidenceId: "ev-old", agentRunId: "run-0", title: "Rival shipped", domain: "sec.gov" },
    ]);
  });

  it("classifies by the evidence's own run id, not a caller-supplied set", () => {
    const [resolved] = resolveBriefCitations([point({ evidenceIds: ["ev-old"] })], "run-2", known, claimsById);
    expect(resolved.citations).toEqual([
      { kind: "earlier-run", evidenceId: "ev-old", agentRunId: "run-0", title: "Rival shipped", domain: "sec.gov" },
    ]);
  });

  it("drops unresolvable ids rather than rendering a dead anchor", () => {
    const [resolved] = resolveBriefCitations(
      [point({ evidenceIds: ["ev-this", "ev-deleted"] })],
      "run-1",
      known,
      claimsById,
    );
    expect(resolved.citations.map((c) => c.evidenceId)).toEqual(["ev-this"]);
  });

  it("keeps a point whose claim was deleted, with a null statement", () => {
    const [resolved] = resolveBriefCitations(
      [point({ claimId: "claim-gone", claimOrdinal: 7 })],
      "run-1",
      known,
      claimsById,
    );
    expect(resolved.claimStatement).toBeNull();
    expect(resolved.claimOrdinal).toBe(7);
    expect(resolved.argument).toBe("Margins fell.");
  });

  it("carries the claim statement when the claim still exists", () => {
    const [resolved] = resolveBriefCitations([point({ claimId: "claim-b" })], "run-1", known, claimsById);
    expect(resolved.claimStatement).toBe("NVIDIA keeps its accelerator lead");
  });

  it("preserves point order", () => {
    const resolved = resolveBriefCitations(
      [point({ argument: "first" }), point({ argument: "second" })],
      "run-1",
      known,
      claimsById,
    );
    expect(resolved.map((p) => p.argument)).toEqual(["first", "second"]);
  });
});
