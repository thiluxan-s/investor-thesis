import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline challenger replay. Cycled (not 1:1 with runs) so a scenario can be
// replayed repeatedly without exhausting. Each entry is a full Anthropic message
// containing a return_challenge_brief tool_use block.
export class ChallengeBriefFixtureReader {
  private items: unknown[];
  private idx = 0;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "challenge-brief.json");
    if (!existsSync(path)) throw new Error(`Challenge brief fixture not found: ${scenario} (${path})`);
    this.items = JSON.parse(readFileSync(path, "utf8")) as unknown[];
    if (this.items.length === 0) throw new Error(`Challenge brief fixture is empty: ${scenario}`);
  }
  next(): unknown {
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    return item;
  }
}
