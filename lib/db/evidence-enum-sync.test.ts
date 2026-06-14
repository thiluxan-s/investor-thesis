import { describe, it, expect } from "vitest";
import { EVIDENCE_IMPACTS } from "@/schemas/evidence";
import { evidenceImpact } from "@/lib/db/schema";

describe("evidence_impact enum sync", () => {
  it("pgEnum matches the client-safe tuple", () => {
    expect([...evidenceImpact.enumValues]).toEqual([...EVIDENCE_IMPACTS]);
  });
});
