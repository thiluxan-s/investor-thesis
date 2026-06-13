// Opus 4.8 pricing (per 1M tokens). Update if CURRENT_MODEL changes.
const INPUT_PER_MTOK = 5;
const OUTPUT_PER_MTOK = 25;

export function estimateRunCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_PER_MTOK + (outputTokens / 1_000_000) * OUTPUT_PER_MTOK;
}

export function formatUsd(usd: number): string {
  // Sub-dollar runs need more precision; show 3 dp under $1, else 2 dp.
  const dp = usd > 0 && usd < 1 ? 3 : 2;
  return `~$${usd.toFixed(dp)}`;
}
