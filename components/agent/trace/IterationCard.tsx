"use client";
import { motion } from "motion/react";
import type { AgentRunIteration, Evidence, Source } from "@/lib/db/schema";
import type { EvidenceVerdict } from "@/lib/agent/evidence-verdicts";
import { extractThinking, readToolCalls } from "@/lib/agent/trace";
import { ToolCallBlock } from "./ToolCallBlock";
import { EvidenceCard } from "./EvidenceCard";

export function IterationCard({
  iteration,
  active,
  index,
  evidence,
  sourcesById,
  verdictsByEvidenceId,
}: {
  iteration: AgentRunIteration;
  active: boolean;
  index: number;
  evidence: Evidence[];
  sourcesById: Map<string, Source>;
  verdictsByEvidenceId: Map<string, EvidenceVerdict[]>;
}) {
  const thinking = extractThinking(iteration.responseContent);
  const calls = readToolCalls(iteration.toolCalls);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      // Gentle staggered reveal on first load; new iterations (fresh keys) animate
      // in on their own as polling discovers them.
      transition={{ duration: 0.28, ease: "easeOut", delay: Math.min(index, 6) * 0.04 }}
      className="relative mb-7"
    >
      <span
        className={`absolute -left-[30px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 border-[#1E3A5F] bg-white text-[10px] font-bold text-[#1E3A5F] ${
          active ? "animate-pulse" : ""
        }`}
      >
        {iteration.iterationNumber + 1}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Iteration {iteration.iterationNumber + 1}
        </span>
        <span className="font-mono text-[11px] text-zinc-400">
          {iteration.inputTokens + iteration.outputTokens} tok · {(iteration.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      {thinking && (
        <div className="my-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Reasoning</p>
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-600">{thinking}</p>
        </div>
      )}
      {calls.map((c, i) => (
        <ToolCallBlock key={i} call={c} />
      ))}
      {evidence.map((ev) => (
        <EvidenceCard
          key={ev.id}
          ev={ev}
          domain={sourcesById.get(ev.sourceId)?.domain ?? "source"}
          verdicts={verdictsByEvidenceId.get(ev.id) ?? []}
        />
      ))}
    </motion.div>
  );
}
