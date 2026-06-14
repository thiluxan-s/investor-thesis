import type { Evidence } from "@/lib/db/schema";
import type { EvidenceVerdict } from "@/lib/agent/evidence-verdicts";

const IMPACT_STYLE = {
  strengthens: { dot: "bg-health-strong", text: "text-health-strong", label: "strengthens" },
  neutral: { dot: "bg-health-neutral", text: "text-zinc-500", label: "neutral" },
  weakens: { dot: "bg-health-weak", text: "text-health-weak", label: "weakens" },
} as const;

export function EvidenceCard({
  ev,
  domain,
  verdicts,
}: {
  ev: Evidence;
  domain: string;
  verdicts: EvidenceVerdict[];
}) {
  return (
    <div className="my-2.5 rounded-lg border border-zinc-200 border-l-[3px] border-l-health-strong bg-white px-3 py-2.5">
      <div className="text-[11px] text-zinc-400">
        <span className="font-mono">{domain}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{ev.extractedText}</p>
      {verdicts.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-zinc-100 pt-2">
          {verdicts.map((v) => {
            const style = v.impact ? IMPACT_STYLE[v.impact] : null;
            return (
              <details key={v.claimNumber} className="group text-[11px]">
                <summary className="-mx-1 flex cursor-pointer list-none items-center gap-2 rounded px-1 py-1 text-zinc-500 marker:content-none hover:bg-zinc-50">
                  <span className="font-semibold uppercase tracking-wide text-zinc-400">claim {v.claimNumber}</span>
                  {style ? (
                    <>
                      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                      <span className={`font-medium ${style.text}`}>{style.label}</span>
                      {v.confidence !== null && (
                        <span className="font-mono tabular-nums text-zinc-400">{v.confidence.toFixed(2)}</span>
                      )}
                    </>
                  ) : (
                    <span className="italic text-zinc-400">not evaluated</span>
                  )}
                  {v.reasoning && (
                    <svg
                      className="ml-auto size-3 text-zinc-300 transition-transform duration-200 group-open:rotate-90"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden
                    >
                      <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </summary>
                {v.reasoning && <p className="mt-0.5 px-1 pb-1 leading-relaxed text-zinc-500">{v.reasoning}</p>}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
