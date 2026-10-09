import { useCachedPromise } from "@raycast/utils";
import { useRef } from "react";
import {
  getLivez,
  getQuota,
  getReadyz,
  getStats,
  getStatsHistory,
  getStatsLifetime,
  loadSubscription,
  type SubscriptionResult,
} from "../api/client";
import type { DisplaySession, QuotaResponse } from "../api/types";
import {
  buildDeltas,
  buildWindowReport,
  fromRuntimeStats,
  fromSavingsLifetime,
  type HistoryDeltas,
  type SavingsTotals,
  type WindowReport,
} from "../lib/history";
import { resolvePeriod, USAGE_PERIODS, type PeriodId } from "../lib/periods";
import { getPrefs } from "../lib/preferences";

/** Errors render through ErrorEmptyView, so the generic failure toast would be a duplicate. */
const QUERY_OPTIONS = { keepPreviousData: true, onError: () => undefined } as const;

function useSignal() {
  return useRef<AbortController | null>(null);
}

/** Raw history never reaches the cache: only the derived reports (a few KB) are returned from the hooks. */
async function loadDeltas(timezone: string, signal?: AbortSignal) {
  const history = await getStatsHistory(signal);
  return { history, deltas: buildDeltas(history.history, timezone) };
}

function reportFor(deltas: HistoryDeltas, period: PeriodId): WindowReport {
  return buildWindowReport(deltas, resolvePeriod(period, deltas.timezone));
}

export interface Overview {
  reports: Record<PeriodId, WindowReport>;
  session: DisplaySession;
  sessionInactivityMinutes: number | null;
  runtime: SavingsTotals;
  lifetime: SavingsTotals;
  lifetimeStartedAt: string | null;
  historyStart: string | null;
}

export function useOverview() {
  const { timezone } = getPrefs();
  const abortable = useSignal();
  return useCachedPromise(
    async (tz: string): Promise<Overview> => {
      const signal = abortable.current?.signal;
      const [{ history, deltas }, stats, lifetime] = await Promise.all([
        loadDeltas(tz, signal),
        getStats(signal),
        getStatsLifetime(signal),
      ]);
      const reports = Object.fromEntries(USAGE_PERIODS.map((period) => [period, reportFor(deltas, period)]));
      return {
        reports: reports as Record<PeriodId, WindowReport>,
        session: history.display_session,
        sessionInactivityMinutes: history.display_session_policy?.rollover_inactivity_minutes ?? null,
        runtime: fromRuntimeStats(stats),
        lifetime: fromSavingsLifetime(history.lifetime),
        lifetimeStartedAt: lifetime.started_at,
        historyStart: deltas.historyStart,
      };
    },
    [timezone],
    { ...QUERY_OPTIONS, abortable },
  );
}

export function useWindowReport(period: PeriodId) {
  const { timezone } = getPrefs();
  const abortable = useSignal();
  return useCachedPromise(
    async (tz: string, p: PeriodId) => {
      const { deltas } = await loadDeltas(tz, abortable.current?.signal);
      return reportFor(deltas, p);
    },
    [timezone, period],
    { ...QUERY_OPTIONS, abortable },
  );
}

export interface LifetimeModelRow {
  name: string;
  totals: SavingsTotals;
  outputTokens: number | null;
  lastActivityAt: string | null;
}

/** Lifetime per-model rows: savings-tracker dollars merged with persistent metrics (output tokens, last activity). */
export function useLifetimeModels() {
  const abortable = useSignal();
  return useCachedPromise(
    async () => {
      const signal = abortable.current?.signal;
      const [history, lifetime] = await Promise.all([getStatsHistory(signal), getStatsLifetime(signal)]);
      const names = new Set([...Object.keys(history.by_model ?? {}), ...Object.keys(lifetime.by_model ?? {})]);
      const rows: LifetimeModelRow[] = [...names]
        .filter((name) => !name.startsWith("passthrough:") && name !== "other")
        .map((name) => {
          const savings = history.by_model?.[name];
          const persistent = lifetime.by_model?.[name];
          return {
            name,
            totals: {
              requests: savings?.requests ?? persistent?.requests ?? 0,
              tokensSaved: savings?.tokens_saved ?? persistent?.tokens_saved ?? 0,
              compressionSavingsUsd: savings?.compression_savings_usd ?? 0,
              cacheReadTokens: 0,
              cacheSavingsUsd: 0,
              inputTokens: savings?.total_input_tokens ?? persistent?.input_tokens ?? 0,
              inputCostUsd: savings?.total_input_cost_usd ?? 0,
              outputTokensSaved: 0,
              outputSavingsUsd: 0,
            },
            outputTokens: persistent?.output_tokens ?? null,
            lastActivityAt: persistent?.last_activity_at ?? null,
          };
        })
        .filter((row) => row.totals.requests > 0);
      return { rows, startedAt: lifetime.started_at };
    },
    [],
    { ...QUERY_OPTIONS, abortable },
  );
}

/** Window report for the cache discount plus runtime and lifetime prefix-cache counters. */
export function usePrefixCache(period: PeriodId) {
  const { timezone } = getPrefs();
  const abortable = useSignal();
  return useCachedPromise(
    async (tz: string, p: PeriodId) => {
      const signal = abortable.current?.signal;
      const [{ deltas }, stats, lifetime] = await Promise.all([
        loadDeltas(tz, signal),
        getStats(signal),
        getStatsLifetime(signal),
      ]);
      return { report: reportFor(deltas, p), stats, lifetime };
    },
    [timezone, period],
    { ...QUERY_OPTIONS, abortable },
  );
}

export function useStats() {
  const abortable = useSignal();
  return useCachedPromise(() => getStats(abortable.current?.signal), [], { ...QUERY_OPTIONS, abortable });
}

export function useStatsWithLifetime() {
  const abortable = useSignal();
  return useCachedPromise(
    async () => {
      const signal = abortable.current?.signal;
      const [stats, lifetime] = await Promise.all([getStats(signal), getStatsLifetime(signal)]);
      return { stats, lifetime };
    },
    [],
    { ...QUERY_OPTIONS, abortable },
  );
}

export function useHealth() {
  const abortable = useSignal();
  return useCachedPromise(
    async () => {
      const signal = abortable.current?.signal;
      const [readyz, stats, lifetime] = await Promise.all([
        getReadyz(signal),
        getStats(signal),
        getStatsLifetime(signal),
      ]);
      return { readyz, stats, lifetime };
    },
    [],
    { ...QUERY_OPTIONS, abortable },
  );
}

export function useSubscription() {
  const abortable = useSignal();
  return useCachedPromise(
    async (): Promise<{ anthropic: SubscriptionResult; quota: QuotaResponse }> => {
      const signal = abortable.current?.signal;
      const [anthropic, quota] = await Promise.all([loadSubscription(signal), getQuota(signal)]);
      return { anthropic, quota };
    },
    [],
    { ...QUERY_OPTIONS, abortable },
  );
}

/**
 * `/subscription-window` may trigger one Anthropic usage poll; Headroom floors those at 60 s, below the menu bar's
 * 5-minute refresh.
 */
export function useMenuBarData() {
  const { timezone } = getPrefs();
  const abortable = useSignal();
  return useCachedPromise(
    async (tz: string) => {
      const signal = abortable.current?.signal;
      const [{ history, deltas }, stats, livez, anthropic] = await Promise.all([
        loadDeltas(tz, signal),
        getStats(signal),
        getLivez(signal),
        loadSubscription(signal),
      ]);
      return {
        today: reportFor(deltas, "today"),
        session: history.display_session,
        lifetime: fromSavingsLifetime(history.lifetime),
        cacheHitRate: stats.prefix_cache?.totals?.hit_rate ?? null,
        livez,
        anthropic,
      };
    },
    [timezone],
    { ...QUERY_OPTIONS, abortable },
  );
}
