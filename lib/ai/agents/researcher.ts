import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/ai/client";
import { toAnthropicTools } from "@/lib/ai/client";
import { TOOLS, executeToolCallSafely } from "@/lib/ai/tools/registry";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/types";
import { ReturnResultSchema, type EvidenceItem, type AgentRunMode } from "@/schemas/agent";
import {
  systemPrompt,
  buildResearchTask,
  challengeSystemPrompt,
  buildChallengeTask,
} from "@/lib/ai/prompts/researcher";

export interface ResearcherPersist {
  appendIteration(it: {
    iterationNumber: number;
    requestMessages: unknown;
    responseContent: unknown;
    toolCalls: unknown;
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  }): Promise<void>;
  persistEvidence(item: EvidenceItem): Promise<void>;
}

export type ResearcherDeps = {
  client: AnthropicLike;
  toolContext: ToolContext;
  persist: ResearcherPersist;
  maxIterations: number;
  maxTokens: number;
  toolRunner?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

export type ResearcherResult = {
  status: "complete" | "partial" | "failed";
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  evidenceCount: number;
  reason?: string;
};

type AnyMessage = Anthropic.Message;

export async function runResearcher(
  thesis: { title: string; ticker: string; positionDirection: string; timeHorizon: string },
  claims: { statement: string }[],
  seenSourceUrls: string[],
  deps: ResearcherDeps,
  _scenario: string,
  mode: AgentRunMode = "research",
): Promise<ResearcherResult> {
  const tools = toAnthropicTools(TOOLS) as { name: string; description: string; input_schema: unknown }[];
  const runTool = deps.toolRunner ?? executeToolCallSafely;
  // Mode selects the prompt pair; the loop below is identical for both.
  const activeSystem = mode === "challenge" ? challengeSystemPrompt : systemPrompt;
  const buildTask = mode === "challenge" ? buildChallengeTask : buildResearchTask;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildTask(thesis, claims, seenSourceUrls) },
  ];

  let iterations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let evidenceCount = 0;

  while (iterations < deps.maxIterations && inputTokens + outputTokens < deps.maxTokens) {
    const started = Date.now();
    const response = (await deps.client.createMessage({ system: activeSystem, tools, messages })) as AnyMessage;
    const it = response.usage?.input_tokens ?? 0;
    const ot = response.usage?.output_tokens ?? 0;
    inputTokens += it;
    outputTokens += ot;

    const content = response.content ?? [];
    const toolUses = content.filter(
      (b): b is Anthropic.ToolUseBlock => (b as { type?: string }).type === "tool_use",
    );

    const finalCall = toolUses.find((b) => b.name === "return_result");
    if (finalCall) {
      const parsed = ReturnResultSchema.safeParse(finalCall.input);
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: [{ tool_name: "return_result", input: finalCall.input }],
        stopReason: response.stop_reason ?? null,
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      if (parsed.success) {
        for (const item of parsed.data.evidence) {
          await deps.persist.persistEvidence(item);
          evidenceCount++;
        }
      }
      return {
        status: "complete",
        iterations: iterations + 1,
        inputTokens,
        outputTokens,
        evidenceCount,
        // Surface malformed final output in the trace rather than silently
        // returning an empty result (helps when reading the run after the fact).
        reason: parsed.success ? undefined : "return_result payload failed schema validation",
      };
    }

    if (response.stop_reason === "tool_use" && toolUses.length > 0) {
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      const toolCallLog: unknown[] = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input, deps.toolContext);
        toolCallLog.push({
          tool_name: tu.name,
          input: tu.input,
          output: result.ok ? result.output : undefined,
          error: result.ok ? undefined : result.error,
        });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result.ok ? result.output : { error: result.error }),
          is_error: !result.ok,
        });
      }
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: toolCallLog,
        stopReason: response.stop_reason ?? null,
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: toolResultBlocks });
      iterations++;
      continue;
    }

    if (response.stop_reason === "end_turn") {
      await deps.persist.appendIteration({
        iterationNumber: iterations,
        requestMessages: messages,
        responseContent: content,
        toolCalls: null,
        stopReason: "end_turn",
        inputTokens: it,
        outputTokens: ot,
        durationMs: Date.now() - started,
      });
      return { status: "complete", iterations: iterations + 1, inputTokens, outputTokens, evidenceCount };
    }

    await deps.persist.appendIteration({
      iterationNumber: iterations,
      requestMessages: messages,
      responseContent: content,
      toolCalls: null,
      stopReason: response.stop_reason ?? null,
      inputTokens: it,
      outputTokens: ot,
      durationMs: Date.now() - started,
    });
    return {
      status: "failed",
      iterations: iterations + 1,
      inputTokens,
      outputTokens,
      evidenceCount,
      reason: `Unexpected stop_reason: ${response.stop_reason}`,
    };
  }

  return { status: "partial", iterations, inputTokens, outputTokens, evidenceCount, reason: "budget_or_iteration_cap" };
}
