import { describe, it, expect } from "vitest";
import {
  TickerSchema,
  ClaimInputSchema,
  CreateThesisSchema,
  UpdateThesisSchema,
} from "./thesis";

const validClaim = { statement: "Revenue grows over forty percent YoY.", category: "financial_performance" } as const;

function baseThesis() {
  return {
    title: "Long NVDA — data center",
    ticker: "nvda",
    positionDirection: "long",
    timeHorizon: "6_to_12_months",
    status: "active",
    claims: [validClaim, { ...validClaim, category: "valuation" }],
  };
}

describe("TickerSchema", () => {
  it("canonicalizes to uppercase and trims", () => {
    expect(TickerSchema.parse("  nvda ")).toBe("NVDA");
  });
  it("rejects non-letters and over-long tickers", () => {
    expect(TickerSchema.safeParse("NV1").success).toBe(false);
    expect(TickerSchema.safeParse("TOOLONG").success).toBe(false);
    expect(TickerSchema.safeParse("").success).toBe(false);
  });
});

describe("ClaimInputSchema", () => {
  it("accepts a 10–300 char statement with a valid category", () => {
    expect(ClaimInputSchema.safeParse(validClaim).success).toBe(true);
  });
  it("rejects too-short statements and bad categories", () => {
    expect(ClaimInputSchema.safeParse({ ...validClaim, statement: "too short" }).success).toBe(false);
    expect(ClaimInputSchema.safeParse({ ...validClaim, category: "nope" }).success).toBe(false);
  });
  it("accepts a statement at the 10-char lower boundary", () => {
    expect(ClaimInputSchema.safeParse({ ...validClaim, statement: "a".repeat(10) }).success).toBe(true);
  });
  it("rejects a statement past the 300-char upper boundary", () => {
    expect(ClaimInputSchema.safeParse({ ...validClaim, statement: "a".repeat(301) }).success).toBe(false);
  });
});

describe("CreateThesisSchema", () => {
  it("accepts 2–5 claims and canonicalizes the ticker", () => {
    const r = CreateThesisSchema.safeParse(baseThesis());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ticker).toBe("NVDA");
  });
  it("rejects fewer than 2 claims", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), claims: [validClaim] }).success).toBe(false);
  });
  it("rejects more than 5 claims", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), claims: Array(6).fill(validClaim) }).success).toBe(false);
  });
  it("rejects 'closed' as an initial status", () => {
    expect(CreateThesisSchema.safeParse({ ...baseThesis(), status: "closed" }).success).toBe(false);
  });
});

describe("UpdateThesisSchema", () => {
  it("allows 'closed' status on update", () => {
    expect(UpdateThesisSchema.safeParse({ status: "closed" }).success).toBe(true);
  });
  it("allows a partial patch (notes only)", () => {
    expect(UpdateThesisSchema.safeParse({ notes: "watching capex" }).success).toBe(true);
  });
  it("strips immutable fields (ticker, positionDirection) from an update", () => {
    const r = UpdateThesisSchema.safeParse({ status: "closed", ticker: "AMZN", positionDirection: "short" });
    expect(r.success).toBe(true);
    if (r.success) {
      const data = r.data as Record<string, unknown>;
      expect(data.ticker).toBeUndefined();
      expect(data.positionDirection).toBeUndefined();
    }
  });
});
