import { getStatsHistory } from "../api/client";
import { formatDateTime } from "./format";
import {
  buildDeltas,
  buildWindowReport,
  combinedSavingsUsd,
  costWithoutHeadroomUsd,
  tokenSavingsPercent,
  type SavingsTotals,
  type WindowReport,
} from "./history";
import { resolveWindow, type PeriodId, type ResolvedWindow, type WindowInput } from "./periods";
import { getPrefs } from "./preferences";

export function toolWindow(input: WindowInput, defaultPeriod: PeriodId): ResolvedWindow {
  return resolveWindow(input, defaultPeriod, getPrefs().timezone);
}

/** Rounds money to cents (sub-cent values keep 4 decimals) and percentages to 2 decimals for compact tool output. */
export function round(value: number | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function usd(value: number): number | null {
  return round(value, Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 4 : 2);
}

export function compactTotals(t: SavingsTotals) {
  return {
    compressionSavingsUsd: usd(t.compressionSavingsUsd),
    tokensSaved: t.tokensSaved,
    tokenSavingsPercent: round(tokenSavingsPercent(t)),
    inputCostUsd: usd(t.inputCostUsd),
    costWithoutHeadroomUsd: usd(costWithoutHeadroomUsd(t)),
    inputTokensSent: t.inputTokens,
    providerCacheDiscountUsd: usd(t.cacheSavingsUsd),
    cacheReadTokens: t.cacheReadTokens,
    combinedSavingsUsd: usd(combinedSavingsUsd(t)),
    outputTokensSaved: t.outputTokensSaved,
    outputSavingsUsd: usd(t.outputSavingsUsd),
    requests: t.requests,
  };
}

/** Builds the report for a tool window from the full savings history. */
export async function loadWindowReport(window: ResolvedWindow): Promise<WindowReport> {
  const history = await getStatsHistory();
  return buildWindowReport(buildDeltas(history.history, window.timezone), window);
}

export function describeWindow(window: ResolvedWindow, report: WindowReport) {
  return {
    period: window.period,
    startDate: report.startDate,
    endDate: report.endDate,
    timezone: report.timezone,
    dayCount: report.dayCount,
  };
}

/** Human-readable warning when the window starts before the first stored savings checkpoint. */
export function coverageWarning(report: WindowReport): string | undefined {
  if (!report.coverage.partial) return undefined;
  const start = report.coverage.historyStart
    ? formatDateTime(report.coverage.historyStart, report.timezone)
    : "no checkpoint yet";
  return `Partial data: Headroom's savings history starts at ${start} (${report.timezone}); the window begins earlier, so earlier activity is missing.`;
}
