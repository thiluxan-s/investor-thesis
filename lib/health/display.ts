// Pure presentation helpers for health scores in [-1, 1]. No server imports —
// safe to use in client components.

// Scores within ±this of 0 read neutral (zinc), so a barely-positive score
// doesn't glow green. Outside the band, the sign picks strong/weak.
export const HEALTH_DEADBAND = 0.15;

export function healthTone(score: number): "strong" | "neutral" | "weak" {
  if (score > HEALTH_DEADBAND) return "strong";
  if (score < -HEALTH_DEADBAND) return "weak";
  return "neutral";
}

// Always two decimals with an explicit sign; uses a true minus glyph (U+2212)
// to match the mono numeric style. Rounds before deciding the sign so a value
// like -0.001 shows "0.00", not "−0.00".
export function formatHealthScore(score: number): string {
  const clamped = Math.max(-1, Math.min(1, score));
  const fixed = Math.abs(clamped).toFixed(2);
  if (fixed === "0.00") return "0.00";
  return clamped > 0 ? `+${fixed}` : `−${fixed}`;
}

// Colored-segment geometry for a centered −1..1 bar. The track is 0..100 with
// center at 50; positive scores fill right (green), negative fill left (red).
export function healthBarFill(score: number): { leftPct: number; widthPct: number } {
  const clamped = Math.max(-1, Math.min(1, score));
  const half = Math.abs(clamped) * 50;
  return clamped >= 0 ? { leftPct: 50, widthPct: half } : { leftPct: 50 - half, widthPct: half };
}

// Impact chip styling, shared by the run-trace evidence card and the claim
// drill-down's evidence rows. Lives here with the other pure presentation
// helpers so the two surfaces cannot drift apart.
export const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;
