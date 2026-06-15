import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROOT } from "@/lib/ai/fixtures";

// Offline summarizer replay: one recorded return_digest message per scenario.
export class DigestFixtureReader {
  private item: unknown;
  constructor(scenario: string, root: string = FIXTURE_ROOT) {
    const path = join(root, scenario, "digest.json");
    if (!existsSync(path)) throw new Error(`Digest fixture not found: ${scenario} (${path})`);
    this.item = JSON.parse(readFileSync(path, "utf8"));
  }
  next(): unknown {
    return this.item;
  }
}
