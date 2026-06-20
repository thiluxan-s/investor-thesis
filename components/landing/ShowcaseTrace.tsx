import { TRACE_SHOWCASE } from "./showcase-data";

const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;

export function ShowcaseTrace() {
  const t = TRACE_SHOWCASE;
  return (
    <div className="relative pl-[26px] text-left">
      <span className="absolute bottom-2 left-[7px] top-1.5 w-0.5 bg-zinc-200" aria-hidden />
      <span className="absolute left-0 top-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
        1
      </span>

      <p className="text-sm leading-relaxed text-zinc-700">{t.reasoning}</p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px]">
        <span className="font-semibold text-zinc-700">{t.toolCall.name}</span>
        <span className="text-zinc-400">{t.toolCall.query}</span>
      </div>

      <div className="my-3 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5">
        <div className="font-mono text-[11px] text-zinc-400">{t.evidence.domain}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{t.evidence.text}</p>
        <div className="mt-2.5 flex flex-col gap-1 border-t border-zinc-100 pt-2">
          {t.evidence.verdicts.map((v) => {
            const s = IMPACT_STYLE[v.impact];
            return (
              <div key={v.claimNumber} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-zinc-400">claim {v.claimNumber}</span>
                <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
                <span className={`font-medium ${s.text}`}>{s.label}</span>
                <span className="font-mono tabular-nums text-zinc-400">{v.confidence.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
