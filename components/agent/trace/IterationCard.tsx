"use client";
import { motion } from "motion/react";
import type { AgentRunIteration, Evidence, Source } from "@/lib/db/schema";
import { extractThinking, readToolCalls } from "@/lib/agent/trace";
import { ToolCallBlock } from "./ToolCallBlock";
import { EvidenceCard } from "./EvidenceCard";

export function IterationCard({
  iteration,
  active,
  evidence,
  sourcesById,
}: {
  iteration: AgentRunIteration;
  active: boolean;
  evidence: Evidence[];
  sourcesById: Map<string, Source>;
}) {
  const thinking = extractThinking(iteration.responseContent);
  const calls = readToolCalls(iteration.toolCalls);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
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
        <p className="my-2 text-[13.5px] leading-relaxed text-zinc-600">
          <span className="mr-1.5 text-[11px] uppercase tracking-wide text-zinc-400">Reasoning</span>
          {thinking}
        </p>
      )}
      {calls.map((c, i) => (
        <ToolCallBlock key={i} call={c} />
      ))}
      {evidence.map((ev) => (
        <EvidenceCard key={ev.id} ev={ev} domain={sourcesById.get(ev.sourceId)?.domain ?? "source"} />
      ))}
    </motion.div>
  );
}
