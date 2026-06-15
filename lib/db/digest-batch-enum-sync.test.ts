import { describe, it, expect } from "vitest";
import { DIGEST_BATCH_STATUSES } from "@/schemas/digest-batch";
import { digestBatchStatus } from "@/lib/db/schema";

describe("digest_batch_status enum sync", () => {
  it("pgEnum matches the client-safe tuple", () => {
    expect([...digestBatchStatus.enumValues]).toEqual([...DIGEST_BATCH_STATUSES]);
  });
});
