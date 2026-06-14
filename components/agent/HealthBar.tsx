import { healthTone, formatHealthScore, healthBarFill } from "@/lib/health/display";

const TONE_FILL = {
  strong: "bg-health-strong",
  neutral: "bg-health-neutral",
  weak: "bg-health-weak",
} as const;
const TONE_TEXT = {
  strong: "text-health-strong",
  neutral: "text-zinc-500",
  weak: "text-health-weak",
} as const;

type HealthBarProps = {
  // Health score in [-1, 1]. May be null when unanalyzed.
  score: number | null;
  // Whether this claim/thesis has been analyzed at least once. When false the
  // bar shows the dashed "Not analyzed" state regardless of score.
  analyzed: boolean;
  // Track width; bars on dense rows are narrower than the detail summary.
  trackClassName?: string;
};

export function HealthBar({ score, analyzed, trackClassName = "w-24" }: HealthBarProps) {
  if (!analyzed || score === null) {
    return (
      <span className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-1.5 rounded-full border border-dashed border-zinc-300 ${trackClassName}`} />
        Not analyzed
      </span>
    );
  }
  const tone = healthTone(score);
  const { leftPct, widthPct } = healthBarFill(score);
  return (
    <span className="flex items-center gap-2">
      <span className={`relative h-1.5 overflow-hidden rounded-full bg-zinc-100 ${trackClassName}`}>
        {/* center tick */}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-zinc-300" aria-hidden />
        <span
          className={`absolute top-0 h-full rounded-full ${TONE_FILL[tone]}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </span>
      <span className={`font-mono text-xs tabular-nums ${TONE_TEXT[tone]}`}>{formatHealthScore(score)}</span>
    </span>
  );
}
