import { describe, it, expect } from "vitest";
import {
  POSITION_DIRECTIONS,
  TIME_HORIZONS,
  THESIS_STATUSES,
  CLAIM_CATEGORIES,
} from "@/schemas/thesis";
import { positionDirection, timeHorizon, thesisStatus, claimCategory } from "@/lib/db/schema";

// The enum value tuples are intentionally duplicated: schemas/thesis.ts must stay
// client-safe (zod only) and lib/db/schema.ts must stay free of @/ imports for
// drizzle-kit. This test fails if the two ever drift apart.
describe("enum tuples stay in sync between schemas/thesis.ts and the pgEnums", () => {
  it("position_direction", () => {
    expect([...positionDirection.enumValues]).toEqual([...POSITION_DIRECTIONS]);
  });
  it("time_horizon", () => {
    expect([...timeHorizon.enumValues]).toEqual([...TIME_HORIZONS]);
  });
  it("thesis_status", () => {
    expect([...thesisStatus.enumValues]).toEqual([...THESIS_STATUSES]);
  });
  it("claim_category", () => {
    expect([...claimCategory.enumValues]).toEqual([...CLAIM_CATEGORIES]);
  });
});
