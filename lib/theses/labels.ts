import type {
  ClaimCategory,
  PositionDirection,
  TimeHorizon,
  ThesisStatus,
} from "@/schemas/thesis";

export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  financial_performance: "Financial performance",
  product_traction: "Product traction",
  competitive_position: "Competitive position",
  macro_environment: "Macro environment",
  execution: "Execution",
  valuation: "Valuation",
  other: "Other",
};

export const DIRECTION_LABELS: Record<PositionDirection, string> = {
  long: "Long",
  short: "Short",
};

export const HORIZON_LABELS: Record<TimeHorizon, string> = {
  weeks: "Weeks",
  months: "Months",
  "6_to_12_months": "6–12 months",
  years: "Years",
};

export const STATUS_LABELS: Record<ThesisStatus, string> = {
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};
