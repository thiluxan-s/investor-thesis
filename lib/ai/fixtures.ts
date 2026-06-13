import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const FIXTURE_ROOT = join(process.cwd(), "__fixtures__", "agent-runs");

export class FixtureReader {
  private messages: unknown[];
  private toolResults: unknown[];
  private mIdx = 0;
  private tIdx = 0;

  constructor(root: string, scenario: string) {
    const dir = join(root, scenario);
    const msgPath = join(dir, "messages.json");
    const toolPath = join(dir, "tools.json");
    if (!existsSync(msgPath)) throw new Error(`Fixture scenario not found: ${scenario} (${msgPath})`);
    this.messages = JSON.parse(readFileSync(msgPath, "utf8")) as unknown[];
    this.toolResults = existsSync(toolPath) ? (JSON.parse(readFileSync(toolPath, "utf8")) as unknown[]) : [];
  }

  nextMessage(): unknown {
    if (this.mIdx >= this.messages.length) throw new Error("Fixture messages exhausted");
    return this.messages[this.mIdx++];
  }

  nextToolResult(): unknown {
    if (this.tIdx >= this.toolResults.length) throw new Error("Fixture tool results exhausted");
    return this.toolResults[this.tIdx++];
  }
}
