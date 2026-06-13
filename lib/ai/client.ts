import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tool } from "@/lib/ai/tools/types";

export const CURRENT_MODEL = "claude-opus-4-8";

export type AnthropicLike = {
  createMessage(params: {
    system: string;
    tools: { name: string; description: string; input_schema: unknown }[];
    messages: Anthropic.MessageParam[];
  }): Promise<Anthropic.Message>;
};

export function createAnthropicClient(apiKey: string): AnthropicLike {
  const sdk = new Anthropic({ apiKey });
  return {
    async createMessage({ system, tools, messages }) {
      // The thinking/output_config/cache_control fields are current Opus 4.8 API.
      // The constructed literal's inferred type doesn't satisfy the ToolUnion
      // discriminated union for tools[], so we cast the full params object to
      // MessageCreateParamsNonStreaming (which is the correct target type).
      const params = {
        model: CURRENT_MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: tools.map((t, i) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
          ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
        })),
        messages,
      };
      return sdk.messages.create(params as Anthropic.MessageCreateParamsNonStreaming);
    },
  };
}

export function toAnthropicTools(tools: Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.inputSchema) as unknown,
  }));
}
