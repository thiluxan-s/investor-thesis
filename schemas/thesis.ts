import { z } from "zod";

// Enum value tuples. These are intentionally duplicated in lib/db/schema.ts
// (pgEnum) because schema.ts must stay free of @/ imports for drizzle-kit, and
// this module must stay client-safe (zod only, no DB). Keep the two in sync.
export const POSITION_DIRECTIONS = ["long", "short"] as const;
export const TIME_HORIZONS = ["weeks", "months", "6_to_12_months", "years"] as const;
export const THESIS_STATUSES = ["active", "paused", "closed"] as const;
export const CREATE_STATUSES = ["active", "paused"] as const;
export const CLAIM_CATEGORIES = [
  "financial_performance",
  "product_traction",
  "competitive_position",
  "macro_environment",
  "execution",
  "valuation",
  "other",
] as const;

// Canonicalize (trim + uppercase) BEFORE validating so "  nvda " => "NVDA".
export const TickerSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
  z.string().regex(/^[A-Z]{1,6}$/, "Ticker must be 1–6 uppercase letters"),
);

export const ClaimCategorySchema = z.enum(CLAIM_CATEGORIES);

export const ClaimInputSchema = z.object({
  statement: z
    .string()
    .trim()
    .min(10, "Claim must be at least 10 characters")
    .max(300, "Claim must be at most 300 characters"),
  category: ClaimCategorySchema,
});

export const CreateThesisSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(120, "Title is too long"),
  ticker: TickerSchema,
  positionDirection: z.enum(POSITION_DIRECTIONS),
  timeHorizon: z.enum(TIME_HORIZONS),
  status: z.enum(CREATE_STATUSES),
  notes: z.string().trim().max(2000).optional(),
  claims: z
    .array(ClaimInputSchema)
    .min(2, "Add at least 2 claims")
    .max(5, "A thesis can have at most 5 claims"),
});

export const UpdateThesisSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  status: z.enum(THESIS_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateThesisInput = z.infer<typeof CreateThesisSchema>;
export type UpdateThesisInput = z.infer<typeof UpdateThesisSchema>;
export type ClaimInput = z.infer<typeof ClaimInputSchema>;
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>;
export type PositionDirection = (typeof POSITION_DIRECTIONS)[number];
export type TimeHorizon = (typeof TIME_HORIZONS)[number];
export type ThesisStatus = (typeof THESIS_STATUSES)[number];
