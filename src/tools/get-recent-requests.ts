import { getStats } from "../api/client";

type Input = {
  /** Maximum rows to return, newest first (default 10, Headroom keeps at most 25). */
  limit?: number;
  /** Only requests whose model contains this text (case-insensitive), e.g. "opus". */
  model?: string;
};

/** The most recent requests Headroom proxied, newest first. */
export default async function tool(input: Input = {}) {
  const stats = await getStats();
  if (stats.recent_requests === undefined) {
    return {
      available: false,
      reason:
        "Headroom only shares per-request metadata with loopback callers or trusted dashboard clients (HEADROOM_PROXY_TRUSTED_DASHBOARD_CLIENT_CIDRS).",
      requests: [],
    };
  }

  const max = Math.max(1, Math.min(25, Math.round(input.limit ?? 10)));
  const needle = input.model?.trim().toLowerCase();
  const rows = stats.recent_requests.filter((row) => !needle || (row.model ?? "").toLowerCase().includes(needle));

  return {
    available: true,
    matching: rows.length,
    requests: rows.slice(0, max).map((row) => ({
      requestId: row.request_id,
      timestamp: row.timestamp,
      model: row.model,
      provider: row.provider,
      inputTokensBefore: row.input_tokens_original,
      inputTokensSent: row.input_tokens_optimized,
      tokensSaved: row.tokens_saved,
      savingsPercent: row.savings_percent,
      outputTokens: row.output_tokens,
      transforms: row.transforms_applied ?? [],
      totalLatencyMs: row.total_latency_ms,
      optimizationLatencyMs: row.optimization_latency_ms,
    })),
  };
}
