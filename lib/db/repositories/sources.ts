import "server-only";
import { and, eq, gte } from "drizzle-orm";
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
  const [raced] = await db.select().from(sources).where(eq(sources.urlHash, hash)).limit(1);
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
