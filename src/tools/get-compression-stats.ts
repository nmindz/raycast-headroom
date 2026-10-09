import { getStats, getStatsLifetime } from "../api/client";
import { round } from "../lib/tool-support";

function ranked(record: Record<string, number> | undefined, limit = 12) {
  return Object.entries(record ?? {})
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

/** How Headroom compresses requests since the proxy started, plus lifetime token savings and waste signals. */
export default async function tool() {
  const [stats, lifetime] = await Promise.all([getStats(), getStatsLifetime()]);
  const compression = stats.summary?.compression;
  const counts = stats.compressions_by_strategy ?? {};
  const saved = stats.tokens_saved_by_strategy ?? {};
  const tradeoff = stats.prefix_cache?.compression_vs_cache;

  return {
    mode: stats.summary?.mode ?? null,
    sinceProxyStart: {
      tokensSaved: stats.tokens?.saved ?? null,
      tokenSavingsPercent: stats.tokens?.savings_percent ?? null,
      requestsCompressed: compression?.requests_compressed ?? null,
      avgCompressionPercent: compression?.avg_compression_pct ?? null,
      bestCompressionPercent: compression?.best_compression_pct ?? null,
      bestCompressionDetail: compression?.best_detail ?? null,
      compressionSavingsUsd: round(stats.cost?.compression_savings_usd),
    },
    lifetime: {
      startedAt: lifetime.started_at,
      tokensSaved: lifetime.tokens.saved,
      tokenSavingsPercent: round(lifetime.tokens.token_savings_percent),
      compressionSavingsUsd: round(lifetime.cost.compression_savings_usd),
    },
    strategies: [...new Set([...Object.keys(counts), ...Object.keys(saved)])]
      .map((name) => ({ name, compressions: counts[name] ?? 0, tokensSaved: saved[name] ?? 0 }))
      .sort((a, b) => b.tokensSaved - a.tokensSaved || b.compressions - a.compressions),
    routerDecisions: ranked(stats.router?.route_counts),
    wasteSignalTokens: { sinceProxyStart: ranked(stats.waste_signals), lifetime: ranked(lifetime.waste_signals) },
    compressionVsCache: tradeoff
      ? {
          tokensSavedByCompression: tradeoff.tokens_saved_by_compression,
          tokensLostToCacheBusts: tradeoff.tokens_lost_to_cache_bust,
          cacheBusts: tradeoff.cache_bust_count,
          netTokens: tradeoff.net_tokens,
        }
      : null,
    ccr: stats.compression
      ? {
          storedEntries: stats.compression.ccr_entries,
          maxEntries: stats.compression.ccr_max_entries,
          retrievals: stats.compression.ccr_retrievals,
        }
      : null,
    toin: stats.toin
      ? {
          enabled: stats.toin.enabled,
          patternsTracked: stats.toin.patterns_tracked,
          retrievalRatePercent: round(stats.toin.global_retrieval_rate * 100),
          patternsWithRecommendations: stats.toin.patterns_with_recommendations,
        }
      : null,
  };
}
