"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentRunStatus } from "@/schemas/agent";
import { isTerminalStatus } from "@/lib/agent/run-status";

// Re-runs the Server Component every `intervalMs` while `status` is non-terminal.
export function PollWhileRunning({ status, intervalMs = 3000 }: { status: AgentRunStatus; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (isTerminalStatus(status)) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [status, intervalMs, router]);
  return null;
}
