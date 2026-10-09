import { Color, Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import type { LifetimePrefixCache, PrefixCacheBucket, StatsResponse } from "./api/types";
import { coverageNote, headlineMarkdown, windowLine } from "./components/detail";
import { PeriodDropdown } from "./components/PeriodDropdown";
import { ErrorEmptyView, StandardActions } from "./components/StandardActions";
import { toneColor } from "./components/theme";
import { usePrefixCache } from "./hooks/useHeadroom";
import {
  formatBucket,
  formatDelta,
  formatInt,
  formatPercent,
  formatTokens,
  formatUsd,
  humanizeKey,
  NO_VALUE,
} from "./lib/format";
import type { SavingsTotals } from "./lib/history";
import { PERIOD_TITLES, type PeriodId } from "./lib/periods";

const M = List.Item.Detail.Metadata;

const ATTRIBUTION =
  "Prefix caching is performed by the provider; Headroom reports what it observes in API responses. Its CacheAligner and prefix freeze keep the prefix stable to raise hit rates.";

/** Token-weighted hit rate: cached reads over all input tokens of cache-eligible requests. */
function tokenHitRate(read: number, write: number, uncached: number): number | null {
  const all = read + write + uncached;
  return all > 0 ? (read / all) * 100 : null;
}

export default function PrefixCache() {
  const [period, setPeriod] = useCachedState<PeriodId>("prefix-cache-period", "last-7-days");
  const { data, isLoading, error, revalidate } = usePrefixCache(period);
  const report = data?.report;
  const title = PERIOD_TITLES[period];
  const caption = report ? `${title} · ${windowLine(report)}` : title;
  const trend = report?.change ? formatDelta(report.change.cacheSavingsPercent, "up") : null;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={Boolean(data)}
      searchBarPlaceholder="Search cache sections, models and days"
      searchBarAccessory={<PeriodDropdown value={period} onChange={setPeriod} />}
    >
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : (
        data &&
        report && (
          <>
            <List.Section title={title}>
              <List.Item
                title="Cache Discount"
                icon={{ source: Icon.Coins, tintColor: Color.Green }}
                accessories={[{ text: formatUsd(report.totals.cacheSavingsUsd) }]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      `${formatUsd(report.totals.cacheSavingsUsd)} cache discount`,
                      caption,
                      report,
                    )}
                    metadata={
                      <M>
                        <WindowCacheMetadata totals={report.totals} />
                        {trend && (
                          <M.Label
                            title="Trend"
                            text={{ value: `${trend.text} vs previous`, color: toneColor(trend.tone) }}
                          />
                        )}
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={report} />}
              />
            </List.Section>

            <RuntimeSection stats={data.stats} revalidate={revalidate} />
            <LifetimeSection
              cache={data.lifetime.prefix_cache}
              discountUsd={data.lifetime.cost.cache_savings_usd}
              revalidate={revalidate}
            />

            <List.Section title="By Model" subtitle={`${title} · ranked by cache discount`}>
              {[...report.models]
                .sort((a, b) => b.totals.cacheSavingsUsd - a.totals.cacheSavingsUsd)
                .map((row) => (
                  <List.Item
                    key={row.name}
                    title={row.name}
                    icon={Icon.Box}
                    accessories={[{ text: formatUsd(row.totals.cacheSavingsUsd) }]}
                    detail={
                      <List.Item.Detail
                        markdown={
                          headlineMarkdown(
                            `${formatUsd(row.totals.cacheSavingsUsd)} cache discount`,
                            `**${row.name}** · ${caption}`,
                          ) + coverageNote(report)
                        }
                        metadata={
                          <M>
                            <WindowCacheMetadata totals={row.totals} />
                          </M>
                        }
                      />
                    }
                    actions={<StandardActions revalidate={revalidate} json={row} />}
                  />
                ))}
            </List.Section>

            <List.Section
              title={report.granularity === "hour" ? "By Hour" : "By Day"}
              subtitle={`${title} · newest first`}
            >
              {[...report.series].reverse().map((point) => (
                <List.Item
                  key={point.bucket}
                  title={formatBucket(point.bucket)}
                  icon={Icon.Calendar}
                  accessories={[
                    { text: point.totals.requests === 0 ? NO_VALUE : formatUsd(point.totals.cacheSavingsUsd) },
                  ]}
                  detail={
                    <List.Item.Detail
                      markdown={headlineMarkdown(
                        `${formatUsd(point.totals.cacheSavingsUsd)} cache discount`,
                        `${formatBucket(point.bucket)} · ${report.timezone}`,
                      )}
                      metadata={
                        <M>
                          <WindowCacheMetadata totals={point.totals} />
                        </M>
                      }
                    />
                  }
                  actions={<StandardActions revalidate={revalidate} json={point} />}
                />
              ))}
            </List.Section>
          </>
        )
      )}
    </List>
  );
}

/** History checkpoints carry cache reads and the discount, not writes or busts. */
function WindowCacheMetadata({ totals }: { totals: SavingsTotals }) {
  const readShare =
    totals.cacheReadTokens + totals.inputTokens > 0
      ? (totals.cacheReadTokens / (totals.cacheReadTokens + totals.inputTokens)) * 100
      : null;
  return (
    <>
      <M.Label title="Cache Discount" text={{ value: formatUsd(totals.cacheSavingsUsd), color: Color.Green }} />
      <M.Label title="Cache Read Tokens" text={formatTokens(totals.cacheReadTokens)} />
      <M.Label title="Input Tokens Sent" text={formatTokens(totals.inputTokens)} />
      <M.Label title="Input Cost" text={formatUsd(totals.inputCostUsd)} />
      <M.Label title="Cache Read Share of Input" text={formatPercent(readShare)} />
      <M.Label title="Requests With Savings" text={formatInt(totals.requests)} />
    </>
  );
}

function BucketMetadata({ bucket }: { bucket: PrefixCacheBucket }) {
  return (
    <>
      <M.Label title="Net Discount" text={{ value: formatUsd(bucket.net_savings_usd), color: Color.Green }} />
      <M.Label title="Gross Read Discount" text={`${formatUsd(bucket.savings_usd)} (${bucket.read_discount ?? "—"})`} />
      <M.Label
        title="Cache Write Premium"
        text={`${formatUsd(bucket.write_premium_usd)} (${bucket.write_premium ?? "—"})`}
      />
      <M.Separator />
      <M.Label title="Token Hit Rate" text={formatPercent(bucket.hit_rate)} />
      <M.Label title="Request Hit Rate" text={formatPercent(bucket.request_hit_rate)} />
      <M.Label title="Hit Requests" text={`${formatInt(bucket.hit_requests)} of ${formatInt(bucket.requests)}`} />
      <M.Separator />
      <M.Label title="Cache Read Tokens" text={formatTokens(bucket.cache_read_tokens)} />
      <M.Label title="Cache Write Tokens" text={formatTokens(bucket.cache_write_tokens)} />
      <M.Label
        title="Writes by TTL"
        text={`5m ${formatTokens(bucket.cache_write_5m_tokens)} · 1h ${formatTokens(bucket.cache_write_1h_tokens)}`}
      />
      <M.Label
        title="Observed TTL Mix"
        text={`5m ${formatPercent(bucket.observed_ttl_mix?.["5m_pct"])} · 1h ${formatPercent(bucket.observed_ttl_mix?.["1h_pct"])}`}
      />
      <M.Label title="Uncached Input Tokens" text={formatTokens(bucket.uncached_input_tokens)} />
      <M.Separator />
      <M.Label title="Cache Busts" text={formatInt(bucket.bust_count)} />
      <M.Label title="Tokens Rewritten by Busts" text={formatTokens(bucket.bust_write_tokens)} />
    </>
  );
}

function RuntimeSection({ stats, revalidate }: { stats: StatsResponse; revalidate: () => void }) {
  const cache = stats.prefix_cache;
  const totals = cache?.totals;
  if (!cache || !totals) return null;
  const misses = cache.miss_attribution?.totals ?? {};
  const freeze = cache.prefix_freeze;
  const tradeoff = cache.compression_vs_cache;

  return (
    <List.Section title="Since Proxy Start">
      <List.Item
        title="All Providers"
        icon={Icon.Bolt}
        accessories={[{ text: `hit ${formatPercent(totals.hit_rate)}` }, { text: formatUsd(totals.net_savings_usd) }]}
        detail={
          <List.Item.Detail
            markdown={headlineMarkdown(
              `${formatPercent(totals.hit_rate)} token hit rate`,
              `Since the proxy process started\n\n${ATTRIBUTION}`,
            )}
            metadata={
              <M>
                <BucketMetadata bucket={totals} />
                <M.Separator />
                <M.Label
                  title="Misses"
                  text={`${formatInt(misses.total)} · prefix change ${formatInt(misses.prefix_change)} · TTL expiry ${formatInt(misses.ttl_expiry)} · unknown ${formatInt(misses.unknown)}`}
                />
                {freeze && (
                  <M.Label
                    title="Prefix Freeze"
                    text={`${formatInt(freeze.busts_avoided)} busts avoided · net ${formatTokens(freeze.net_benefit_tokens)} tokens`}
                  />
                )}
                {tradeoff && (
                  <>
                    <M.Label
                      title="Compression vs Cache"
                      text={`saved ${formatTokens(tradeoff.tokens_saved_by_compression)} · lost ${formatTokens(tradeoff.tokens_lost_to_cache_bust)} to ${formatInt(tradeoff.cache_bust_count)} busts`}
                    />
                    <M.Label
                      title="Net Tokens"
                      text={{
                        value: formatTokens(tradeoff.net_tokens),
                        color: tradeoff.net_tokens >= 0 ? Color.Green : Color.Red,
                      }}
                    />
                  </>
                )}
              </M>
            }
          />
        }
        actions={<StandardActions revalidate={revalidate} json={cache} />}
      />
      {Object.entries(cache.by_provider ?? {}).map(([provider, bucket]) => (
        <List.Item
          key={provider}
          title={humanizeKey(provider)}
          subtitle={bucket.label}
          icon={Icon.Cloud}
          accessories={[{ text: `hit ${formatPercent(bucket.hit_rate)}` }, { text: formatUsd(bucket.net_savings_usd) }]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                `${formatPercent(bucket.hit_rate)} token hit rate`,
                `**${humanizeKey(provider)}** · since the proxy process started`,
              )}
              metadata={
                <M>
                  <BucketMetadata bucket={bucket} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={bucket} />}
        />
      ))}
    </List.Section>
  );
}

function LifetimeSection({
  cache,
  discountUsd,
  revalidate,
}: {
  cache: LifetimePrefixCache;
  discountUsd: number;
  revalidate: () => void;
}) {
  const hitRate = tokenHitRate(cache.cache_read_tokens, cache.cache_write_tokens, cache.uncached_input_tokens);
  return (
    <List.Section title="Lifetime">
      <List.Item
        title="All Providers"
        icon={Icon.Calendar}
        accessories={[{ text: `hit ${formatPercent(hitRate)}` }, { text: formatUsd(discountUsd) }]}
        detail={
          <List.Item.Detail
            markdown={headlineMarkdown(
              `${formatPercent(hitRate)} token hit rate`,
              `Lifetime, persisted across restarts\n\n${ATTRIBUTION}`,
            )}
            metadata={
              <M>
                <M.Label title="Cache Discount" text={{ value: formatUsd(discountUsd), color: Color.Green }} />
                <M.Separator />
                <M.Label title="Token Hit Rate" text={formatPercent(hitRate)} />
                <M.Label title="Request Hit Rate" text={formatPercent(cache.cache_hit_rate)} />
                <M.Label
                  title="Hit Requests"
                  text={`${formatInt(cache.hit_requests)} of ${formatInt(cache.requests)}`}
                />
                <M.Separator />
                <M.Label title="Cache Read Tokens" text={formatTokens(cache.cache_read_tokens)} />
                <M.Label title="Cache Write Tokens" text={formatTokens(cache.cache_write_tokens)} />
                <M.Label
                  title="Writes by TTL"
                  text={`5m ${formatTokens(cache.cache_write_5m_tokens)} (${formatPercent(cache.ttl_5m_percent)}) · 1h ${formatTokens(cache.cache_write_1h_tokens)} (${formatPercent(cache.ttl_1h_percent)})`}
                />
                <M.Label title="Uncached Input Tokens" text={formatTokens(cache.uncached_input_tokens)} />
                <M.Separator />
                <M.Label title="Cache Busts" text={formatInt(cache.bust_count)} />
                <M.Label title="Tokens Lost to Busts" text={formatTokens(cache.bust_tokens)} />
                {Object.entries(cache.misses_by_reason ?? {}).map(([reason, count]) => (
                  <M.Label key={reason} title={`Misses: ${humanizeKey(reason)}`} text={formatInt(count)} />
                ))}
              </M>
            }
          />
        }
        actions={<StandardActions revalidate={revalidate} json={cache} />}
      />
    </List.Section>
  );
}
