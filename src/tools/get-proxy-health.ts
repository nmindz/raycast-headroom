import { getReadyz, getStats, getStatsLifetime } from "../api/client";
import { round } from "../lib/tool-support";

/** Readiness, version, uptime, per-component checks, latency and error counts of the Headroom proxy. */
export default async function tool() {
  const [readyz, stats, lifetime] = await Promise.all([getReadyz(), getStats(), getStatsLifetime()]);

  return {
    ready: readyz.ready,
    status: readyz.status,
    version: readyz.version,
    uptimeMinutes: round(readyz.uptime_seconds / 60, 1),
    mode: stats.summary?.mode ?? null,
    deployment: readyz.deployment ?? null,
    checks: Object.fromEntries(
      Object.entries(readyz.checks).map(([name, check]) => [
        name,
        { status: check.status, ready: check.ready, enabled: check.enabled, error: check.error ?? null },
      ]),
    ),
    sinceProxyStart: {
      requests: stats.requests?.total ?? null,
      failed: stats.requests?.failed ?? null,
      rateLimited: stats.requests?.rate_limited ?? null,
      avgLatencyMs: round(stats.latency?.average_ms, 0),
      maxLatencyMs: round(stats.latency?.max_ms, 0),
      avgHeadroomOverheadMs: round(stats.overhead?.average_ms, 0),
      avgTimeToFirstByteMs: round(stats.ttfb?.average_ms, 0),
      httpStatusCounts: stats.proxy_inbound?.by_status ?? {},
    },
    compressionExecutor: readyz.runtime?.compression_executor ?? null,
    persistence: lifetime.persistence ?? null,
    lifetime: {
      startedAt: lifetime.started_at,
      requests: lifetime.requests.total,
      failed: lifetime.requests.failed,
      rateLimited: lifetime.requests.rate_limited,
    },
  };
}
