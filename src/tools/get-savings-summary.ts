import { getStatsHistory, getStatsLifetime } from "../api/client";
import { fromSavingsLifetime } from "../lib/history";
import {
  compactTotals,
  coverageWarning,
  describeWindow,
  loadWindowReport,
  round,
  toolWindow,
} from "../lib/tool-support";

type Input = {
  /**
   * Preset window, or "session" for Headroom's current display session (it rolls over after an hour without requests)
   * or "lifetime" for everything Headroom has recorded. Weeks start on Monday. Ignored when startDate or endDate is given.
   */
  period?:
    | "today"
    | "yesterday"
    | "last-7-days"
    | "this-week"
    | "last-week"
    | "this-month"
    | "last-month"
    | "last-30-days"
    | "session"
    | "lifetime";
  /** First day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  startDate?: string;
  /** Last day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  endDate?: string;
};

/**
 * How much Headroom saved. "compressionSavingsUsd" is what Headroom's compression saved; the provider cache discount is
 * reported separately because prefix caching is done by the provider (Headroom only keeps prefixes stable).
 */
export default async function tool(input: Input = {}) {
  const { period, ...dates } = input;
  const explicit = Boolean(dates.startDate || dates.endDate);

  if (!explicit && (period === "session" || period === "lifetime")) {
    const [history, lifetime] = await Promise.all([getStatsHistory(), getStatsLifetime()]);
    if (period === "session") {
      const session = history.display_session;
      return {
        scope: "session",
        startedAt: session.started_at,
        lastActivityAt: session.last_activity_at,
        rolloverAfterInactiveMinutes: history.display_session_policy?.rollover_inactivity_minutes ?? null,
        totals: compactTotals(fromSavingsLifetime(session)),
      };
    }
    return {
      scope: "lifetime",
      startedAt: lifetime.started_at,
      totals: compactTotals(fromSavingsLifetime(history.lifetime)),
      requestsFailed: lifetime.requests.failed,
      requestsRateLimited: lifetime.requests.rate_limited,
    };
  }

  const preset = period === "session" || period === "lifetime" ? undefined : period;
  const window = toolWindow({ ...dates, period: preset }, "last-7-days");
  const report = await loadWindowReport(window);

  return {
    scope: "window",
    window: describeWindow(window, report),
    totals: compactTotals(report.totals),
    previousWindow: report.previous
      ? {
          startDate: report.previous.startDate,
          endDate: report.previous.endDate,
          compressionSavingsUsd: round(report.previous.totals.compressionSavingsUsd),
          compressionSavingsChangePercent: round(report.change?.compressionSavingsPercent),
          inputCostChangePercent: round(report.change?.inputCostPercent),
          cacheDiscountChangePercent: round(report.change?.cacheSavingsPercent),
        }
      : null,
    topModels: report.models.slice(0, 5).map((row) => ({ model: row.name, ...compactTotals(row.totals) })),
    series: report.series.map((point) => ({
      bucket: point.bucket,
      compressionSavingsUsd: round(point.totals.compressionSavingsUsd, 4),
      tokensSaved: point.totals.tokensSaved,
      inputCostUsd: round(point.totals.inputCostUsd),
      providerCacheDiscountUsd: round(point.totals.cacheSavingsUsd),
    })),
    warning: coverageWarning(report),
  };
}
