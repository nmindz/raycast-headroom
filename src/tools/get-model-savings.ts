import { getStatsHistory, getStatsLifetime } from "../api/client";
import { sortModels, type ModelSort, type NamedTotals } from "../lib/history";
import { compactTotals, coverageWarning, describeWindow, loadWindowReport, toolWindow } from "../lib/tool-support";

type Input = {
  /**
   * Preset window, or "lifetime" for everything Headroom has recorded (lifetime rows have no per-model cache discount).
   * Weeks start on Monday. Ignored when startDate or endDate is given.
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
    | "lifetime";
  /** First day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  startDate?: string;
  /** Last day of the window, inclusive, YYYY-MM-DD in the configured time zone. Overrides period. */
  endDate?: string;
  /** Ranking: compression savings (default), provider cache discount, input cost, tokens saved or requests. */
  sortBy?: ModelSort;
  /** Maximum rows to return (default 10). */
  limit?: number;
};

/** Ranks models by what Headroom saved or what they cost, with each model's share of the total. */
export default async function tool(input: Input = {}) {
  const { period, sortBy = "compression", limit = 10, ...dates } = input;
  const max = Math.max(1, Math.min(50, Math.round(limit)));

  if (period === "lifetime" && !dates.startDate && !dates.endDate) {
    const [history, lifetime] = await Promise.all([getStatsHistory(), getStatsLifetime()]);
    const rows: NamedTotals[] = Object.entries(history.by_model ?? {})
      .filter(([name, row]) => !name.startsWith("passthrough:") && name !== "other" && row.requests > 0)
      .map(([name, row]) => ({
        name,
        totals: {
          requests: row.requests,
          tokensSaved: row.tokens_saved,
          compressionSavingsUsd: row.compression_savings_usd,
          cacheReadTokens: 0,
          cacheSavingsUsd: 0,
          inputTokens: row.total_input_tokens,
          inputCostUsd: row.total_input_cost_usd,
          outputTokensSaved: 0,
          outputSavingsUsd: 0,
        },
      }));
    return {
      scope: "lifetime",
      startedAt: lifetime.started_at,
      sortedBy: sortBy,
      rowCount: rows.length,
      rows: sortModels(rows, sortBy)
        .slice(0, max)
        .map((row) => ({
          model: row.name,
          lastActivityAt: lifetime.by_model?.[row.name]?.last_activity_at ?? null,
          ...compactTotals(row.totals),
          providerCacheDiscountUsd: null,
          combinedSavingsUsd: null,
        })),
      note: "Lifetime per-model rows cover compression and input cost; Headroom does not track the cache discount per model over its lifetime.",
    };
  }

  const window = toolWindow({ ...dates, period: period === "lifetime" ? undefined : period }, "last-7-days");
  const report = await loadWindowReport(window);
  return {
    scope: "window",
    window: describeWindow(window, report),
    sortedBy: sortBy,
    totals: compactTotals(report.totals),
    rowCount: report.models.length,
    rows: sortModels(report.models, sortBy)
      .slice(0, max)
      .map((row) => ({ model: row.name, ...compactTotals(row.totals) })),
    warning: coverageWarning(report),
  };
}
