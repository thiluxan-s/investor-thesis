import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline evaluator replay. The verdict list is CYCLED (not 1:1 with pairs) so
// the harness works for any claim×evidence count and exercises mixed impacts.
// Each entry is a full Anthropic message with a return_evaluation tool_use block.
export class EvaluationFixtureReader {
  private items: unknown[];
  private idx = 0;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "evaluations.json");
    if (!existsSync(path)) throw new Error(`Evaluation fixture not found: ${scenario} (${path})`);
    this.items = JSON.parse(readFileSync(path, "utf8")) as unknown[];
    if (this.items.length === 0) throw new Error(`Evaluation fixture is empty: ${scenario}`);
  }
  next(): unknown {
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    return item;
  }
}
