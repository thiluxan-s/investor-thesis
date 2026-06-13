type Block = { type?: string; thinking?: string; text?: string; name?: string; input?: unknown };

function asArray(v: unknown): Block[] {
  return Array.isArray(v) ? (v as Block[]) : [];
}

export function extractThinking(content: unknown): string {
  return asArray(content)
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string")
    .map((b) => b.thinking!.trim())
    .join("\n\n");
}

export function extractText(content: unknown): string {
  return asArray(content)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!.trim())
    .join("\n\n");
}

export type TraceToolCall = { name: string; input: unknown; output?: unknown; error?: string; isError: boolean };

export function readToolCalls(toolCalls: unknown): TraceToolCall[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((c) => {
    const tc = c as { tool_name?: string; input?: unknown; output?: unknown; error?: string };
    return {
      name: typeof tc.tool_name === "string" ? tc.tool_name : "unknown",
      input: tc.input,
      output: tc.output,
      error: tc.error,
      isError: typeof tc.error === "string" && tc.error.length > 0,
    };
  });
}
