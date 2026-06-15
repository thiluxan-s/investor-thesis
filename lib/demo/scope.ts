import { DEMO_THESIS_ID } from "./constants";

// Pure guard: only let demo-thesis rows through. Load-bearing — it stops
// /demo/runs/[anyId] from leaking another user's run by id.
export function scopeToDemo<T extends { thesisId: string }>(row: T | null): T | null {
  return row && row.thesisId === DEMO_THESIS_ID ? row : null;
}
