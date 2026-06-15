import "server-only";
import type { Anthropic } from "@anthropic-ai/sdk";
import { createElement } from "react";
import { inngest, type DigestRequested } from "@/lib/inngest/client";
import { claimBatchForSend, finishBatch, listRunsForBatch } from "@/lib/db/repositories/digest-batches";
import { getUserById } from "@/lib/db/repositories/users";
import { getThesesByIds } from "@/lib/db/repositories/theses";
import { listEvidenceForRun } from "@/lib/db/repositories/evidence";
import { getSourcesByIds } from "@/lib/db/repositories/sources";
import { listSnapshotsForThesis } from "@/lib/db/repositories/health-snapshots";
import { selectChangedTheses } from "@/lib/digest/select";
import { summarize } from "@/lib/ai/agents/summarizer";
import { DigestFixtureReader } from "@/lib/ai/digest-fixtures";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { WeeklyDigest, type DigestEmailThesis } from "@/emails/WeeklyDigest";
import { sendDigestEmail } from "@/lib/resend/client";
import { serverEnv } from "@/lib/env.server";

export const generateDigest = inngest.createFunction(
  { id: "generate-digest", retries: 2, triggers: [{ event: "digest.requested" }] },
  async ({ event, step }) => {
    const { batchId, userId, scenario } = event.data as DigestRequested["data"];

    // Exactly-once claim: only the first delivery flips pending -> sending. A
    // batch left in 'sending' (a step threw past its retries) is the deliberate
    // "failed mid-flight, won't re-send" state — claimBatchForSend only matches
    // 'pending', so a crash after claiming never produces a duplicate email.
    const claimed = await step.run("claim-batch", () => claimBatchForSend(batchId));
    if (!claimed) return { status: "already-handled" as const };

    const user = await step.run("load-user", () => getUserById(userId));
    if (!user) { await finishBatch(batchId, "skipped"); return { status: "no-user" as const }; }
    if (!user.digestEnabled) { await finishBatch(batchId, "skipped"); return { status: "disabled" as const }; }

    const runs = await step.run("load-runs", () => listRunsForBatch(batchId));
    const thesisIds = [...new Set(runs.map((r) => r.thesisId))];
    const theses = await step.run("load-theses", () => getThesesByIds(thesisIds));

    const evidenceByThesis = new Map<string, { sourceDomain: string; extractedText: string }[]>();
    const snapshotsByThesis = new Map<string, { overallScore: number }[]>();
    for (const run of runs) {
      const ev = await step.run(`load-evidence-${run.id}`, () => listEvidenceForRun(run.id));
      if (ev.length) {
        const srcRows = await step.run(`load-sources-${run.id}`, () => getSourcesByIds([...new Set(ev.map((e) => e.sourceId))]));
        const domainById = new Map(srcRows.map((s) => [s.id, s.domain]));
        evidenceByThesis.set(
          run.thesisId,
          ev.map((e) => ({ sourceDomain: domainById.get(e.sourceId) ?? "source", extractedText: e.extractedText })),
        );
      }
    }
    for (const t of theses) {
      const snaps = await step.run(`load-snaps-${t.id}`, () => listSnapshotsForThesis(t.id));
      snapshotsByThesis.set(t.id, snaps.map((s) => ({ overallScore: Number(s.overallScore) })));
    }

    const changed = selectChangedTheses({
      theses: theses.map((t) => ({ id: t.id, title: t.title, ticker: t.ticker, positionDirection: t.positionDirection })),
      evidenceByThesis,
      snapshotsByThesis,
    });
    if (changed.length === 0) { await finishBatch(batchId, "skipped"); return { status: "nothing-changed" as const }; }

    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const client: AnthropicLike = useFixtures
      ? { createMessage: async () => new DigestFixtureReader(scenario ?? "nvda-happy-path").next() as Anthropic.Message }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
    const digest = await step.run("summarize", () => summarize(changed, { client }));

    // Map blurbs by thesisId (real path); fall back to position with fixtures
    // (the recorded fixture can't know the dev thesis id).
    const blurbByThesisId = new Map(digest.theses.map((d) => [d.thesisId, d.blurb]));
    const emailTheses: DigestEmailThesis[] = changed.map((c, i) => ({
      thesisId: c.thesisId,
      ticker: c.ticker,
      title: c.title,
      healthBefore: c.healthBefore,
      healthAfter: c.healthAfter,
      blurb: blurbByThesisId.get(c.thesisId) ?? digest.theses[i]?.blurb ?? "",
    }));

    await step.run("send-email", () =>
      sendDigestEmail({
        to: user.email,
        subject: "Your weekly thesis digest",
        react: createElement(WeeklyDigest, { theses: emailTheses, appUrl: serverEnv.NEXT_PUBLIC_APP_URL }),
      }),
    );
    await finishBatch(batchId, "sent");
    return { status: "sent" as const, theses: emailTheses.length };
  },
);
