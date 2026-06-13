"use client";
import { useState } from "react";
import type { TraceToolCall } from "@/lib/agent/trace";

export function ToolCallBlock({ call }: { call: TraceToolCall }) {
  const [open, setOpen] = useState(false);
  const argPreview = typeof call.input === "object" && call.input ? JSON.stringify(call.input) : String(call.input ?? "");
  return (
    <div className={`mb-2 overflow-hidden rounded-lg border ${call.isError ? "border-[#eccac1]" : "border-zinc-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${call.isError ? "bg-[#fbf1ef]" : "bg-zinc-50"}`}
      >
        <span className={`font-semibold ${call.isError ? "text-[#C0492F]" : "text-[#1E3A5F]"}`}>{call.name}</span>
        <span className="truncate font-mono text-zinc-500">{argPreview}</span>
        {call.isError && (
          <span className="rounded border border-[#eccac1] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#C0492F]">
            refused
          </span>
        )}
        <span className="ml-auto text-zinc-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-100 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
          {call.isError ? call.error : JSON.stringify(call.output ?? call.input, null, 2)}
        </pre>
      )}
    </div>
  );
}
