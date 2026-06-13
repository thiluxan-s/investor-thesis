import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sources, evidence, agentRuns, type Source } from "@/lib/db/schema";
import { urlHash } from "@/lib/ai/url";

export async function findOrCreateSource(input: {
  url: string;
  domain: string;
  title: string | null;
  rawContentHash: string;
  contentExcerpt: string;
}): Promise<Source> {
  const hash = urlHash(input.url);
  const [existing] = await db.select().from(sources).where(eq(sources.urlHash, hash)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(sources)
    .values({
      url: input.url,
      urlHash: hash,
      domain: input.domain,
      title: input.title,
      rawContentHash: input.rawContentHash,
      contentExcerpt: input.contentExcerpt,
    })
    .onConflictDoNothing({ target: sources.urlHash })
    .returning();
  if (row) return row;
  // Lost an insert race — the conflicting row must exist. Throw (don't return
  // undefined) so the Promise<Source> contract holds and callers never deref undefined.
  const [raced] = await db.select().from(sources).where(eq(sources.urlHash, hash)).limit(1);
  if (!raced) throw new Error(`findOrCreateSource: source row not found after conflict for ${input.url}`);
  return raced;
}

export async function listRecentSourceUrlsForThesis(thesisId: string, sinceDays: number): Promise<string[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .selectDistinct({ url: sources.url })
    .from(sources)
    .innerJoin(evidence, eq(evidence.sourceId, sources.id))
    .innerJoin(agentRuns, eq(agentRuns.id, evidence.agentRunId))
    .where(and(eq(agentRuns.thesisId, thesisId), gte(sources.createdAt, since)));
  return rows.map((r) => r.url);
}

// Sources are public/shared — no user scoping (the referencing run is already
// ownership-checked by the caller).
export async function getSourcesByIds(ids: string[]): Promise<Source[]> {
  if (ids.length === 0) return [];
  return db.select().from(sources).where(inArray(sources.id, ids));
}
