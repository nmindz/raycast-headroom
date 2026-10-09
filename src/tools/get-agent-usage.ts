import { getStats } from "../api/client";

/** Tokens before and after compression and tokens saved per client agent since the proxy started. */
export default async function tool() {
  const stats = await getStats();
  const usage = stats.agent_usage;
  if (!usage) return { available: false, agents: [] };

  return {
    available: true,
    scope: "since the proxy process started",
    totals: usage.totals,
    coverage: usage.coverage ?? null,
    agents: [...usage.agents]
      .sort((a, b) => b.tokens_saved - a.tokens_saved)
      .map((agent) => ({
        agent: agent.agent,
        label: agent.label,
        detectedFrom: agent.source ?? null,
        requests: agent.requests,
        tokensBeforeCompression: agent.before_tokens,
        tokensSent: agent.after_tokens,
        tokensSaved: agent.tokens_saved,
        savingsPercent: agent.savings_percent,
        outputTokens: agent.output_tokens,
        shareOfRequestsPercent: agent.share_of_requests_percent,
        shareOfTokensSavedPercent: agent.share_of_saved_percent,
        exactTokenCounts: agent.has_exact_tokens ?? null,
        models: agent.models ?? {},
      })),
  };
}
