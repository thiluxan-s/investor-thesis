import type { Evidence } from "@/lib/db/schema";

export function EvidenceCard({ ev, domain }: { ev: Evidence; domain: string }) {
  return (
    <div className="my-2.5 rounded-lg border border-zinc-200 border-l-[3px] border-l-[#1F7A4D] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="font-mono">{domain}</span>
        {ev.claimIndices.map((i) => (
          <span
            key={i}
            className="rounded bg-[#eef4ef] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1F7A4D]"
          >
            claim {i + 1}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{ev.extractedText}</p>
    </div>
  );
}
