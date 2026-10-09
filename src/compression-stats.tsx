import { Color, Icon, List } from "@raycast/api";
import type { StatsLifetimeResponse, StatsResponse } from "./api/types";
import { headlineMarkdown } from "./components/detail";
import { ErrorEmptyView, StandardActions } from "./components/StandardActions";
import { useStatsWithLifetime } from "./hooks/useHeadroom";
import {
  formatDurationMs,
  formatInt,
  formatPercent,
  formatRatio,
  formatTokens,
  humanizeKey,
  NO_VALUE,
  progressBar,
} from "./lib/format";

const M = List.Item.Detail.Metadata;

const RUNTIME = "since the proxy process started";

function sortedEntries(record: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(record ?? {}).sort(([, a], [, b]) => b - a);
}

function sum(record: Record<string, number> | undefined): number {
  return Object.values(record ?? {}).reduce((total, value) => total + value, 0);
}

export default function CompressionStats() {
  const { data, isLoading, error, revalidate } = useStatsWithLifetime();

  return (
    <List isLoading={isLoading} isShowingDetail={Boolean(data)} searchBarPlaceholder="Search strategies and signals">
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : (
        data && (
          <>
            <OverviewSection stats={data.stats} lifetime={data.lifetime} revalidate={revalidate} />
            <StrategiesSection stats={data.stats} revalidate={revalidate} />
            <CountsSection
              title="Router Decisions"
              subtitle="why content was or was not compressed"
              icon={Icon.Shuffle}
              counts={data.stats.router?.route_counts}
              unit="decisions"
              revalidate={revalidate}
            />
            <WasteSection stats={data.stats} lifetime={data.lifetime} revalidate={revalidate} />
            <RetrievalSection stats={data.stats} revalidate={revalidate} />
            <TimingSection stats={data.stats} revalidate={revalidate} />
          </>
        )
      )}
    </List>
  );
}

function OverviewSection({
  stats,
  lifetime,
  revalidate,
}: {
  stats: StatsResponse;
  lifetime: StatsLifetimeResponse;
  revalidate: () => void;
}) {
  const compression = stats.summary?.compression;
  const tokens = stats.tokens;
  const json = { summary: stats.summary, tokens, lifetimeTokens: lifetime.tokens };
  return (
    <List.Section title="Overview">
      <List.Item
        title="Since Proxy Start"
        icon={Icon.Bolt}
        subtitle={stats.summary?.mode ? `mode: ${stats.summary.mode}` : undefined}
        accessories={[
          { text: `${formatTokens(tokens?.saved)} saved` },
          { text: formatPercent(tokens?.savings_percent, 2) },
        ]}
        detail={
          <List.Item.Detail
            markdown={headlineMarkdown(
              `${formatTokens(tokens?.saved)} tokens saved`,
              `Compression ${RUNTIME}${compression?.best_detail ? `\n\nBest request: ${compression.best_detail} (${formatPercent(compression.best_compression_pct)}).` : ""}`,
            )}
            metadata={
              <M>
                <M.Label title="Mode" text={stats.summary?.mode ?? NO_VALUE} />
                <M.Label title="Primary Model" text={stats.summary?.primary_model ?? NO_VALUE} />
                <M.Separator />
                <M.Label title="Tokens Saved" text={{ value: formatTokens(tokens?.saved), color: Color.Green }} />
                <M.Label title="Token Savings" text={formatPercent(tokens?.savings_percent, 2)} />
                <M.Label title="Active Savings" text={formatPercent(tokens?.active_savings_percent, 2)} />
                <M.Label
                  title="New Input Savings"
                  text={`${formatPercent(tokens?.new_input_savings_percent, 2)} of ${formatTokens(tokens?.new_input_tokens)} uncached tokens`}
                />
                <M.Separator />
                <M.Label title="Requests Compressed" text={formatInt(compression?.requests_compressed)} />
                <M.Label title="Average Compression" text={formatPercent(compression?.avg_compression_pct)} />
                <M.Label title="Best Compression" text={formatPercent(compression?.best_compression_pct)} />
                <M.Label
                  title="Tokens Removed"
                  text={`${formatTokens(compression?.total_tokens_removed)} of ${formatTokens(compression?.total_tokens_before)}`}
                />
              </M>
            }
          />
        }
        actions={<StandardActions revalidate={revalidate} json={json} />}
      />
      <List.Item
        title="Lifetime"
        icon={Icon.Calendar}
        accessories={[
          { text: `${formatTokens(lifetime.tokens.saved)} saved` },
          { text: formatPercent(lifetime.tokens.token_savings_percent, 2) },
        ]}
        detail={
          <List.Item.Detail
            markdown={headlineMarkdown(
              `${formatTokens(lifetime.tokens.saved)} tokens saved`,
              "Lifetime, persisted across restarts",
            )}
            metadata={
              <M>
                <M.Label
                  title="Tokens Saved"
                  text={{ value: formatTokens(lifetime.tokens.saved), color: Color.Green }}
                />
                <M.Label title="Token Savings" text={formatPercent(lifetime.tokens.token_savings_percent, 2)} />
                <M.Label title="Attempted Input" text={formatTokens(lifetime.tokens.attempted_input)} />
                <M.Label title="Input Sent" text={formatTokens(lifetime.tokens.input)} />
                <M.Label title="Output" text={formatTokens(lifetime.tokens.output)} />
                <M.Separator />
                <M.Label title="Requests" text={formatInt(lifetime.requests.total)} />
                <M.Label title="Failed" text={formatInt(lifetime.requests.failed)} />
                <M.Label title="Rate Limited" text={formatInt(lifetime.requests.rate_limited)} />
              </M>
            }
          />
        }
        actions={<StandardActions revalidate={revalidate} json={lifetime.tokens} />}
      />
    </List.Section>
  );
}

function StrategiesSection({ stats, revalidate }: { stats: StatsResponse; revalidate: () => void }) {
  const counts = stats.compressions_by_strategy ?? {};
  const saved = stats.tokens_saved_by_strategy ?? {};
  const totalSaved = sum(saved);
  const totalCount = sum(counts);
  const names = [...new Set([...Object.keys(counts), ...Object.keys(saved)])].sort(
    (a, b) => (saved[b] ?? 0) - (saved[a] ?? 0) || (counts[b] ?? 0) - (counts[a] ?? 0),
  );
  if (names.length === 0) return null;

  return (
    <List.Section title="Strategies" subtitle="ranked by tokens saved">
      {names.map((name) => {
        const tokens = saved[name] ?? 0;
        const count = counts[name] ?? 0;
        const tokenShare = totalSaved > 0 ? (tokens / totalSaved) * 100 : null;
        const countShare = totalCount > 0 ? (count / totalCount) * 100 : null;
        return (
          <List.Item
            key={name}
            title={humanizeKey(name)}
            icon={Icon.Hammer}
            accessories={[{ text: `${formatInt(count)}×` }, { text: `${formatTokens(tokens)} saved` }]}
            detail={
              <List.Item.Detail
                markdown={headlineMarkdown(
                  `${formatTokens(tokens)} tokens saved`,
                  `Strategy **${name}** · ${formatInt(count)} compressions ${RUNTIME}`,
                )}
                metadata={
                  <M>
                    <M.Label title="Tokens Saved" text={formatInt(tokens)} />
                    <M.Label
                      title="Share of Tokens Saved"
                      text={`${progressBar(tokenShare)} ${formatPercent(tokenShare)}`}
                    />
                    <M.Label title="Compressions" text={formatInt(count)} />
                    <M.Label
                      title="Share of Compressions"
                      text={`${progressBar(countShare)} ${formatPercent(countShare)}`}
                    />
                    <M.Label
                      title="Tokens per Compression"
                      text={count > 0 ? formatTokens(tokens / count) : NO_VALUE}
                    />
                  </M>
                }
              />
            }
            actions={<StandardActions revalidate={revalidate} json={{ strategy: name, compressions: count, tokens }} />}
          />
        );
      })}
    </List.Section>
  );
}

function CountsSection({
  title,
  subtitle,
  icon,
  counts,
  unit,
  revalidate,
}: {
  title: string;
  subtitle: string;
  icon: Icon;
  counts: Record<string, number> | undefined;
  unit: string;
  revalidate: () => void;
}) {
  const entries = sortedEntries(counts);
  const total = sum(counts);
  if (entries.length === 0) return null;
  return (
    <List.Section title={title} subtitle={subtitle}>
      {entries.map(([key, count]) => {
        const share = total > 0 ? (count / total) * 100 : null;
        return (
          <List.Item
            key={key}
            title={humanizeKey(key)}
            icon={icon}
            accessories={[{ text: formatInt(count) }]}
            detail={
              <List.Item.Detail
                markdown={headlineMarkdown(`${formatInt(count)} ${unit}`, `**${key}** · ${RUNTIME}`)}
                metadata={
                  <M>
                    <M.Label title="Count" text={formatInt(count)} />
                    <M.Label title="Share" text={`${progressBar(share)} ${formatPercent(share)}`} />
                    <M.Label title={`All ${unit}`} text={formatInt(total)} />
                  </M>
                }
              />
            }
            actions={<StandardActions revalidate={revalidate} json={{ [key]: count }} />}
          />
        );
      })}
    </List.Section>
  );
}

function WasteSection({
  stats,
  lifetime,
  revalidate,
}: {
  stats: StatsResponse;
  lifetime: StatsLifetimeResponse;
  revalidate: () => void;
}) {
  const runtime = stats.waste_signals ?? {};
  const total = lifetime.waste_signals ?? {};
  const keys = [...new Set([...Object.keys(runtime), ...Object.keys(total)])]
    .filter((key) => (runtime[key] ?? 0) > 0 || (total[key] ?? 0) > 0)
    .sort((a, b) => (total[b] ?? 0) - (total[a] ?? 0));
  if (keys.length === 0) return null;
  return (
    <List.Section title="Waste Signals" subtitle="wasteful content found in prompts, in tokens">
      {keys.map((key) => (
        <List.Item
          key={key}
          title={humanizeKey(key)}
          icon={Icon.Trash}
          accessories={[
            { text: formatTokens(runtime[key] ?? 0), tooltip: `Tokens ${RUNTIME}` },
            { text: `${formatTokens(total[key] ?? 0)} lifetime`, tooltip: "Tokens over the lifetime" },
          ]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                `${formatTokens(total[key] ?? 0)} tokens`,
                `Waste signal **${key}** detected over the lifetime`,
              )}
              metadata={
                <M>
                  <M.Label title="Since Proxy Start" text={formatInt(runtime[key] ?? 0)} />
                  <M.Label title="Lifetime" text={formatInt(total[key] ?? 0)} />
                </M>
              }
            />
          }
          actions={
            <StandardActions
              revalidate={revalidate}
              json={{ signal: key, runtime: runtime[key] ?? 0, lifetime: total[key] ?? 0 }}
            />
          }
        />
      ))}
    </List.Section>
  );
}

function RetrievalSection({ stats, revalidate }: { stats: StatsResponse; revalidate: () => void }) {
  const ccr = stats.compression;
  const toin = stats.toin;
  if (!ccr && !toin) return null;
  return (
    <List.Section title="Retrieval" subtitle="compressed content the model can fetch back">
      {ccr && (
        <List.Item
          title="Compress-Cache-Retrieve"
          icon={Icon.Download}
          accessories={[{ text: `${formatInt(ccr.ccr_retrievals)} retrievals` }]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                `${formatInt(ccr.ccr_retrievals)} retrievals`,
                `Originals Headroom keeps so the model can retrieve what compression removed, ${RUNTIME}`,
              )}
              metadata={
                <M>
                  <M.Label
                    title="Stored Entries"
                    text={`${formatInt(ccr.ccr_entries)} of ${formatInt(ccr.ccr_max_entries)}`}
                  />
                  <M.Label title="Original Tokens Stored" text={formatTokens(ccr.original_tokens_cached)} />
                  <M.Label title="Compressed Tokens Stored" text={formatTokens(ccr.compressed_tokens_cached)} />
                  <M.Label title="Retrievals" text={formatInt(ccr.ccr_retrievals)} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={ccr} />}
        />
      )}
      {toin && (
        <List.Item
          title="Tool Output Intelligence"
          subtitle={toin.enabled ? undefined : "disabled"}
          icon={Icon.LightBulb}
          accessories={[{ text: `${formatInt(toin.patterns_tracked)} patterns` }]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                `${formatRatio(toin.global_retrieval_rate)} retrieval rate`,
                "TOIN learns which tool outputs get retrieved after compression and adjusts how they are compressed.",
              )}
              metadata={
                <M>
                  <M.Label title="Enabled" text={toin.enabled ? "Yes" : "No"} />
                  <M.Label title="Patterns Tracked" text={formatInt(toin.patterns_tracked)} />
                  <M.Label title="Compressions" text={formatInt(toin.total_compressions)} />
                  <M.Label title="Retrievals" text={formatInt(toin.total_retrievals)} />
                  <M.Label title="Retrieval Rate" text={formatRatio(toin.global_retrieval_rate)} />
                  <M.Label title="Patterns With Recommendations" text={formatInt(toin.patterns_with_recommendations)} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={toin} />}
        />
      )}
    </List.Section>
  );
}

function TimingSection({ stats, revalidate }: { stats: StatsResponse; revalidate: () => void }) {
  const stages = Object.entries(stats.pipeline_timing ?? {}).sort(([, a], [, b]) => b.average_ms - a.average_ms);
  if (stages.length === 0) return null;
  return (
    <List.Section title="Pipeline Timing" subtitle="slowest stages first">
      {stages.map(([stage, timing]) => (
        <List.Item
          key={stage}
          title={humanizeKey(stage)}
          icon={Icon.Clock}
          accessories={[
            { text: `avg ${formatDurationMs(timing.average_ms)}` },
            { text: `${formatInt(timing.count)}×` },
          ]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                `${formatDurationMs(timing.average_ms)} average`,
                `Stage **${stage}** · ${RUNTIME}`,
              )}
              metadata={
                <M>
                  <M.Label title="Average" text={formatDurationMs(timing.average_ms)} />
                  <M.Label title="Maximum" text={formatDurationMs(timing.max_ms)} />
                  <M.Label title="Runs" text={formatInt(timing.count)} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={{ stage, ...timing }} />}
        />
      ))}
    </List.Section>
  );
}
