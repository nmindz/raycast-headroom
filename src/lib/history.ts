import type { HistoryPoint, SavingsLifetime, StatsResponse } from "../api/types";
import { addDays, dayCountOf, startOfDayInstant, todayIn, zonedParts, type DateRange } from "./periods";

/**
 * Additive savings counters. Headroom stores one cumulative checkpoint per request that saved anything, so for
 * history windows `requests` counts requests with a saving; for session, runtime and lifetime it counts every request.
 */
export interface SavingsTotals {
  requests: number;
  /** Input tokens removed by Headroom's compression before forwarding. */
  tokensSaved: number;
  compressionSavingsUsd: number;
  /** Input tokens the provider served from its prefix cache. */
  cacheReadTokens: number;
  /** Provider prefix-cache discount observed by Headroom. */
  cacheSavingsUsd: number;
  /** Input tokens actually forwarded upstream. */
  inputTokens: number;
  inputCostUsd: number;
  outputTokensSaved: number;
  outputSavingsUsd: number;
}

export function emptyTotals(): SavingsTotals {
  return {
    requests: 0,
    tokensSaved: 0,
    compressionSavingsUsd: 0,
    cacheReadTokens: 0,
    cacheSavingsUsd: 0,
    inputTokens: 0,
    inputCostUsd: 0,
    outputTokensSaved: 0,
    outputSavingsUsd: 0,
  };
}

function addInto(target: SavingsTotals, source: SavingsTotals): void {
  target.requests += source.requests;
  target.tokensSaved += source.tokensSaved;
  target.compressionSavingsUsd += source.compressionSavingsUsd;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheSavingsUsd += source.cacheSavingsUsd;
  target.inputTokens += source.inputTokens;
  target.inputCostUsd += source.inputCostUsd;
  target.outputTokensSaved += source.outputTokensSaved;
  target.outputSavingsUsd += source.outputSavingsUsd;
}

/** What the forwarded input would have cost without compression: actual input cost plus compression savings. */
export function costWithoutHeadroomUsd(t: SavingsTotals): number {
  return t.inputCostUsd + t.compressionSavingsUsd;
}

/** Share of the pre-compression input that compression removed; null without traffic. */
export function tokenSavingsPercent(t: SavingsTotals): number | null {
  const before = t.tokensSaved + t.inputTokens;
  return before > 0 ? (t.tokensSaved / before) * 100 : null;
}

/** Compression, prefix-cache and output-shaping savings together. */
export function combinedSavingsUsd(t: SavingsTotals): number {
  return t.compressionSavingsUsd + t.cacheSavingsUsd + t.outputSavingsUsd;
}

export function fromSavingsLifetime(l: SavingsLifetime): SavingsTotals {
  return {
    requests: l.requests,
    tokensSaved: l.tokens_saved,
    compressionSavingsUsd: l.compression_savings_usd,
    cacheReadTokens: l.cache_read_tokens,
    cacheSavingsUsd: l.cache_savings_usd,
    inputTokens: l.total_input_tokens,
    inputCostUsd: l.total_input_cost_usd,
    outputTokensSaved: l.output_tokens_saved ?? 0,
    outputSavingsUsd: l.output_savings_usd ?? 0,
  };
}

/** Counters since the proxy process started, from `/stats`. */
export function fromRuntimeStats(stats: StatsResponse): SavingsTotals {
  return {
    requests: stats.requests?.total ?? 0,
    tokensSaved: stats.tokens?.saved ?? 0,
    compressionSavingsUsd: stats.cost?.compression_savings_usd ?? 0,
    cacheReadTokens: stats.prefix_cache?.totals?.cache_read_tokens ?? 0,
    cacheSavingsUsd: stats.cost?.cache_savings_usd ?? 0,
    inputTokens: stats.tokens?.input ?? 0,
    inputCostUsd: stats.cost?.total_input_cost_usd ?? 0,
    outputTokensSaved: 0,
    outputSavingsUsd: 0,
  };
}

/** One request's contribution, localized once so windows and buckets are plain string comparisons. */
export interface HistoryDelta {
  date: string;
  hour: number;
  model: string;
  provider: string;
  totals: SavingsTotals;
}

export interface HistoryDeltas {
  deltas: HistoryDelta[];
  /** First stored checkpoint: activity before it is folded into that baseline and cannot be attributed. */
  historyStart: string | null;
  timezone: string;
}

const positive = (value: number) => (value > 0 ? value : 0);

/**
 * Turns cumulative checkpoints into per-request deltas. The first point is only a baseline: Headroom keeps a bounded
 * history (5,000 points by default), so its cumulative value includes everything that was pruned before it.
 */
export function buildDeltas(history: HistoryPoint[], timezone: string): HistoryDeltas {
  const deltas: HistoryDelta[] = [];
  let previous: HistoryPoint | undefined;
  for (const point of history) {
    const ms = Date.parse(point.timestamp);
    if (Number.isNaN(ms)) continue;
    if (previous) {
      const { date, hour } = zonedParts(ms, timezone);
      deltas.push({
        date,
        hour,
        model: point.model || "unknown",
        provider: point.provider || "unknown",
        totals: {
          requests: 1,
          tokensSaved: positive(point.total_tokens_saved - previous.total_tokens_saved),
          compressionSavingsUsd: positive(point.compression_savings_usd - previous.compression_savings_usd),
          cacheReadTokens: positive((point.cache_read_tokens ?? 0) - (previous.cache_read_tokens ?? 0)),
          cacheSavingsUsd: positive((point.cache_savings_usd ?? 0) - (previous.cache_savings_usd ?? 0)),
          inputTokens: positive(point.total_input_tokens - previous.total_input_tokens),
          inputCostUsd: positive(point.total_input_cost_usd - previous.total_input_cost_usd),
          outputTokensSaved: positive((point.output_tokens_saved ?? 0) - (previous.output_tokens_saved ?? 0)),
          outputSavingsUsd: positive((point.output_savings_usd ?? 0) - (previous.output_savings_usd ?? 0)),
        },
      });
    }
    previous = point;
  }
  const first = history.find((point) => !Number.isNaN(Date.parse(point.timestamp)));
  return { deltas, historyStart: first?.timestamp ?? null, timezone };
}

export interface NamedTotals {
  name: string;
  totals: SavingsTotals;
}

export interface SeriesBucket {
  /** YYYY-MM-DD, or YYYY-MM-DDTHH:00 for hourly buckets. */
  bucket: string;
  totals: SavingsTotals;
}

export interface WindowChange {
  compressionSavingsPercent: number | null;
  cacheSavingsPercent: number | null;
  inputCostPercent: number | null;
  tokensSavedPercent: number | null;
}

export interface WindowReport extends DateRange {
  timezone: string;
  dayCount: number;
  totals: SavingsTotals;
  /** Previous equal-length window, when the history covers all of it. */
  previous: (DateRange & { totals: SavingsTotals }) | null;
  change: WindowChange | null;
  coverage: { historyStart: string | null; partial: boolean };
  granularity: "hour" | "day";
  series: SeriesBucket[];
  /** Sorted by compression savings, then input cost. */
  models: NamedTotals[];
  providers: NamedTotals[];
}

function sumRange(deltas: HistoryDelta[], range: DateRange): SavingsTotals {
  const totals = emptyTotals();
  for (const delta of deltas) {
    if (delta.date >= range.startDate && delta.date <= range.endDate) addInto(totals, delta.totals);
  }
  return totals;
}

function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function grouped(entries: Map<string, SavingsTotals>): NamedTotals[] {
  return [...entries]
    .map(([name, totals]) => ({ name, totals }))
    .sort(
      (a, b) =>
        b.totals.compressionSavingsUsd - a.totals.compressionSavingsUsd ||
        b.totals.inputCostUsd - a.totals.inputCostUsd,
    );
}

export type ModelSort = "compression" | "cache" | "cost" | "tokens" | "requests";

export const MODEL_SORTS: Array<{ value: ModelSort; title: string; pick: (t: SavingsTotals) => number }> = [
  { value: "compression", title: "Compression Savings", pick: (t) => t.compressionSavingsUsd },
  { value: "cache", title: "Cache Discount", pick: (t) => t.cacheSavingsUsd },
  { value: "cost", title: "Input Cost", pick: (t) => t.inputCostUsd },
  { value: "tokens", title: "Tokens Saved", pick: (t) => t.tokensSaved },
  { value: "requests", title: "Requests", pick: (t) => t.requests },
];

export function sortModels<T extends NamedTotals>(rows: T[], sort: ModelSort): T[] {
  const pick = MODEL_SORTS.find((option) => option.value === sort)?.pick ?? MODEL_SORTS[0].pick;
  return [...rows].sort((a, b) => pick(b.totals) - pick(a.totals));
}

/** Aggregates the deltas whose local date falls in `range` (inclusive) into totals, buckets, models and providers. */
export function buildWindowReport(source: HistoryDeltas, range: DateRange, now: Date = new Date()): WindowReport {
  const { deltas, historyStart, timezone } = source;
  const dayCount = dayCountOf(range);
  const granularity = dayCount === 1 ? "hour" : "day";
  const today = todayIn(timezone, now);
  const historyStartMs = historyStart ? Date.parse(historyStart) : null;
  const covers = (date: string) => historyStartMs !== null && startOfDayInstant(date, timezone) >= historyStartMs;

  const totals = emptyTotals();
  const buckets = new Map<string, SavingsTotals>();
  const models = new Map<string, SavingsTotals>();
  const providers = new Map<string, SavingsTotals>();

  // Every bucket of the window exists, idle ones included, but never past the current hour/day.
  if (granularity === "hour") {
    const lastHour = range.startDate === today ? zonedParts(now.getTime(), timezone).hour : 23;
    for (let hour = 0; hour <= lastHour; hour++) {
      buckets.set(`${range.startDate}T${String(hour).padStart(2, "0")}:00`, emptyTotals());
    }
  } else {
    const last = range.endDate > today ? today : range.endDate;
    for (let date = range.startDate; date <= last; date = addDays(date, 1)) buckets.set(date, emptyTotals());
  }

  for (const delta of deltas) {
    if (delta.date < range.startDate || delta.date > range.endDate) continue;
    addInto(totals, delta.totals);
    const key = granularity === "hour" ? `${delta.date}T${String(delta.hour).padStart(2, "0")}:00` : delta.date;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyTotals();
      buckets.set(key, bucket);
    }
    addInto(bucket, delta.totals);
    for (const [map, name] of [
      [models, delta.model],
      [providers, delta.provider],
    ] as const) {
      let entry = map.get(name);
      if (!entry) {
        entry = emptyTotals();
        map.set(name, entry);
      }
      addInto(entry, delta.totals);
    }
  }

  const previousRange = { startDate: addDays(range.startDate, -dayCount), endDate: addDays(range.startDate, -1) };
  const previous = covers(previousRange.startDate)
    ? { ...previousRange, totals: sumRange(deltas, previousRange) }
    : null;

  return {
    ...range,
    timezone,
    dayCount,
    totals,
    previous,
    change: previous
      ? {
          compressionSavingsPercent: percentChange(totals.compressionSavingsUsd, previous.totals.compressionSavingsUsd),
          cacheSavingsPercent: percentChange(totals.cacheSavingsUsd, previous.totals.cacheSavingsUsd),
          inputCostPercent: percentChange(totals.inputCostUsd, previous.totals.inputCostUsd),
          tokensSavedPercent: percentChange(totals.tokensSaved, previous.totals.tokensSaved),
        }
      : null,
    coverage: { historyStart, partial: !covers(range.startDate) },
    granularity,
    series: [...buckets]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([bucket, bucketTotals]) => ({ bucket, totals: bucketTotals })),
    models: grouped(models),
    providers: grouped(providers),
  };
}
