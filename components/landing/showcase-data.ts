import type { ClaimCategory } from "@/schemas/thesis";
import type { EvidenceImpact } from "@/schemas/evidence";
import type { HealthPoint } from "@/components/theses/HealthChart";

export type ShowcaseClaim = { category: ClaimCategory; statement: string; score: number };

export const DASHBOARD_SHOWCASE = {
  title: "Long NVDA — durable AI data-center demand",
  ticker: "NVDA",
  direction: "LONG",
  horizon: "6–12 mo",
  overallScore: 0.34,
  claims: [
    { category: "financial_performance", statement: "Data-center revenue keeps growing >40% YoY", score: 0.72 },
    { category: "competitive_position", statement: "NVIDIA keeps its lead over competing AI accelerators", score: 0.18 },
    { category: "macro_environment", statement: "Hyperscaler AI capex stays elevated through the period", score: -0.46 },
  ] satisfies ShowcaseClaim[],
  trend: [
    { recordedAt: "2026-05-30", score: 0.55 },
    { recordedAt: "2026-06-06", score: 0.4 },
    { recordedAt: "2026-06-13", score: 0.2 },
    { recordedAt: "2026-06-20", score: 0.34 },
  ] satisfies HealthPoint[],
};

export type ShowcaseVerdict = { claimNumber: number; impact: EvidenceImpact; confidence: number };

export const TRACE_SHOWCASE = {
  reasoning:
    "Starting with the strongest claim — data-center revenue growth. I'll search recent earnings coverage and the latest 10-Q before weighing the competitive and macro signals.",
  toolCall: { name: "web_search", query: "NVIDIA data-center revenue Q3 year over year" },
  evidence: {
    domain: "reuters.com",
    text: "Nvidia reported data-center revenue rose 41% year over year in Q3, ahead of analyst estimates.",
    verdicts: [
      { claimNumber: 1, impact: "strengthens", confidence: 0.8 },
      { claimNumber: 3, impact: "weakens", confidence: 0.6 },
    ] satisfies ShowcaseVerdict[],
  },
};
