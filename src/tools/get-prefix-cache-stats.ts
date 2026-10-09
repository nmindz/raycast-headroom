import { getStats, getStatsLifetime } from "../api/client";
import type { PrefixCacheBucket } from "../api/types";
import {
  compactTotals,
  coverageWarning,
  describeWindow,
  loadWindowReport,
  round,
  toolWindow,
} from "../lib/tool-support";

type Input = {
  /** Preset window for the cache discount breakdown. Weeks start on Monday. Ignored when startDate or endDate is given. */
  period?:
    "today" | "yesterday" | "last-7-days" | "this-week" | "last-week" | "this-month" | "last-month" | "last-30-days";
  /** First day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  startDate?: string;
  /** Last day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  endDate?: string;
};

function compactBucket(bucket: PrefixCacheBucket) {
  return {
    tokenHitRatePercent: bucket.hit_rate,
    requestHitRatePercent: bucket.request_hit_rate ?? null,
    hitRequests: bucket.hit_requests,
    requests: bucket.requests,
    cacheReadTokens: bucket.cache_read_tokens,
    cacheWriteTokens: bucket.cache_write_tokens,
    cacheWrite5mTokens: bucket.cache_write_5m_tokens ?? null,
    cacheWrite1hTokens: bucket.cache_write_1h_tokens ?? null,
    uncachedInputTokens: bucket.uncached_input_tokens,
    grossReadDiscountUsd: round(bucket.savings_usd),
    writePremiumUsd: round(bucket.write_premium_usd),
    netDiscountUsd: round(bucket.net_savings_usd),
    cacheBusts: bucket.bust_count,
    tokensRewrittenByBusts: bucket.bust_write_tokens ?? null,
  };
}

/**
 * Provider prefix-cache statistics observed by Headroom. The discount is the provider's (Anthropic, OpenAI); Headroom
 * raises hit rates by keeping prompt prefixes stable.
 */
export default async function tool(input: Input = {}) {
  const window = toolWindow(input, "last-7-days");
  const [stats, lifetime, report] = await Promise.all([getStats(), getStatsLifetime(), loadWindowReport(window)]);
  const cache = stats.prefix_cache;
  const life = lifetime.prefix_cache;
  const lifetimeInput = life.cache_read_tokens + life.cache_write_tokens + life.uncached_input_tokens;

  return {
    window: {
      ...describeWindow(window, report),
      providerCacheDiscountUsd: compactTotals(report.totals).providerCacheDiscountUsd,
      cacheReadTokens: report.totals.cacheReadTokens,
      discountChangePercent: round(report.change?.cacheSavingsPercent),
      warning: coverageWarning(report),
    },
    sinceProxyStart: cache?.totals
      ? {
          ...compactBucket(cache.totals),
          byProvider: Object.fromEntries(
            Object.entries(cache.by_provider ?? {}).map(([provider, bucket]) => [provider, compactBucket(bucket)]),
          ),
          misses: cache.miss_attribution?.totals ?? null,
          prefixFreeze: cache.prefix_freeze ?? null,
          compressionVsCache: cache.compression_vs_cache ?? null,
        }
      : null,
    lifetime: {
      startedAt: lifetime.started_at,
      discountUsd: round(lifetime.cost.cache_savings_usd),
      tokenHitRatePercent: lifetimeInput > 0 ? round((life.cache_read_tokens / lifetimeInput) * 100) : null,
      requestHitRatePercent: round(life.cache_hit_rate),
      hitRequests: life.hit_requests,
      requests: life.requests,
      cacheReadTokens: life.cache_read_tokens,
      cacheWriteTokens: life.cache_write_tokens,
      ttl5mPercent: round(life.ttl_5m_percent),
      ttl1hPercent: round(life.ttl_1h_percent),
      cacheBusts: life.bust_count,
      tokensLostToBusts: life.bust_tokens,
      missesByReason: life.misses_by_reason ?? {},
    },
  };
}
