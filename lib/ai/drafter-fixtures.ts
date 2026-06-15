import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline drafter replay: one recorded return_drafted_claims message per scenario.
// Input-independent — the dev flow gets canned claims without spending tokens.
export class DrafterFixtureReader {
  private item: unknown;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "drafter.json");
    if (!existsSync(path)) throw new Error(`Drafter fixture not found: ${scenario} (${path})`);
    this.item = JSON.parse(readFileSync(path, "utf8"));
  }
  next(): unknown {
    return this.item;
  }
}
