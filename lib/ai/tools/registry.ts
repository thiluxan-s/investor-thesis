import "server-only";
import type { Tool, ToolContext, ToolResult } from "./types";
import { webSearchTool } from "./web-search";
import { webFetchTool } from "./web-fetch";
import { edgarTool } from "./edgar";
import { returnResultTool } from "./return-result";

export const TOOLS: Tool[] = [webSearchTool, webFetchTool, edgarTool, returnResultTool] as Tool[];

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function executeToolCallSafely(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.issues[0]?.message ?? "validation failed"}` };
  }
  return tool.execute(parsed.data, ctx);
}
