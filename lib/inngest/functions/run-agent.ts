import type { Anthropic } from "@anthropic-ai/sdk";
import { inngest, type AgentRunRequested } from "@/lib/inngest/client";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listRecentSourceUrlsForThesis, findOrCreateSource } from "@/lib/db/repositories/sources";
import { markRunning, finishRun, incrementRunTotals } from "@/lib/db/repositories/agent-runs";
import { appendIteration } from "@/lib/db/repositories/agent-run-iterations";
import { createEvidence } from "@/lib/db/repositories/evidence";
import { runResearcher, type ResearcherPersist } from "@/lib/ai/agents/researcher";
import { createAnthropicClient, type AnthropicLike } from "@/lib/ai/client";
import { buildToolContext } from "@/lib/ai/tool-context";
import type { ToolResult } from "@/lib/ai/tools/types";
import { FixtureReader, FIXTURE_ROOT } from "@/lib/ai/fixtures";
import { serverEnv } from "@/lib/env.server";
import { hostnameOf, sha256 } from "@/lib/ai/url";

export const runAgent = inngest.createFunction(
  { id: "run-agent", retries: 2, triggers: [{ event: "agent.run-requested" }] },
  async ({ event, step }) => {
    const { agentRunId, thesisId, userId, scenario } = event.data as AgentRunRequested["data"];

    const thesis = await step.run("load-thesis", () => getThesisForUser(userId, thesisId));
    if (!thesis) {
      await finishRun(agentRunId, "failed", { error: "Thesis not found or not owned" });
      return { status: "failed" as const };
    }
    const seen = await step.run("load-seen", () => listRecentSourceUrlsForThesis(thesisId, 90));
    await step.run("mark-running", () => markRunning(agentRunId));

    const useFixtures = serverEnv.USE_AI_FIXTURES;
    const reader = useFixtures ? new FixtureReader(FIXTURE_ROOT, scenario ?? "nvda-happy-path") : null;

    // Each model call is its own durable step (memoized — not re-billed on retry).
    // NOTE: the fixture reader's pointer is not retry-safe, but fixtures run
    // offline/deterministically where retries don't occur; the real path (which
    // is what retry-cost matters for) uses no reader.
    let llmStep = 0;
    const baseClient: AnthropicLike = useFixtures
      ? { createMessage: async () => reader!.nextMessage() as Anthropic.Message }
      : createAnthropicClient(serverEnv.ANTHROPIC_API_KEY!);
    const client: AnthropicLike = {
      createMessage: (params) => step.run(`llm-${llmStep++}`, () => baseClient.createMessage(params)),
    };

    const toolContext = buildToolContext(scenario);
    const toolRunner = useFixtures
      ? async (): Promise<ToolResult> => ({ ok: true, output: reader!.nextToolResult() })
      : undefined;

    let iterStep = 0;
    let evStep = 0;
    const persist: ResearcherPersist = {
      appendIteration: async (it) => {
        await step.run(`iteration-${iterStep++}`, async () => {
          await appendIteration({ agentRunId, ...it });
        });
      },
      persistEvidence: async (item) => {
        await step.run(`evidence-${evStep++}`, async () => {
          const source = await findOrCreateSource({
            url: item.source_url,
            domain: hostnameOf(item.source_url),
            title: item.title,
            rawContentHash: sha256(item.extracted_text),
            contentExcerpt: item.snippet,
          });
          await createEvidence({
            agentRunId,
            sourceId: source.id,
            extractedText: item.extracted_text,
            claimIndices: item.claim_indices,
            agentReasoning: null,
          });
        });
      },
    };

    const result = await runResearcher(
      {
        title: thesis.title,
        ticker: thesis.ticker,
        positionDirection: thesis.positionDirection,
        timeHorizon: thesis.timeHorizon,
      },
      thesis.claims.map((c) => ({ statement: c.statement })),
      seen,
      { client, toolContext, persist, maxIterations: 12, maxTokens: 100_000, toolRunner },
      scenario ?? "nvda-happy-path",
    );

    await incrementRunTotals(agentRunId, {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      iterations: result.iterations,
      evidence: result.evidenceCount,
    });
    await finishRun(
      agentRunId,
      result.status === "failed" ? "failed" : result.status === "partial" ? "partial" : "complete",
      { error: result.reason },
    );

    // Kick off evaluation only when the run actually produced evidence.
    if (result.status !== "failed" && result.evidenceCount > 0) {
      await step.sendEvent("emit-agent-run-completed", {
        name: "agent-run.completed",
        data: { agentRunId, thesisId, userId, scenario },
      });
    }

    return { status: result.status };
  },
);
