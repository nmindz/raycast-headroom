import { Color, Icon, List } from "@raycast/api";
import type { ComponentCheck, Timing } from "./api/types";
import { headlineMarkdown } from "./components/detail";
import { ErrorEmptyView, StandardActions } from "./components/StandardActions";
import { statusColor } from "./components/theme";
import { useHealth } from "./hooks/useHeadroom";
import {
  formatDateTime,
  formatDurationMinutes,
  formatDurationMs,
  formatInt,
  formatNumber,
  formatRelativeTime,
  humanizeKey,
  NO_VALUE,
} from "./lib/format";
import { getPrefs } from "./lib/preferences";

const M = List.Item.Detail.Metadata;

const KNOWN_CHECK_FIELDS: Record<string, true> = {
  enabled: true,
  ready: true,
  status: true,
  error: true,
  url: true,
  backend: true,
  optional: true,
};

function yesNo(value: boolean | undefined): string {
  return value === undefined ? NO_VALUE : value ? "Yes" : "No";
}

export default function ProxyHealth() {
  const { data, isLoading, error, revalidate } = useHealth();
  const { timezone, baseUrl } = getPrefs();

  if (error && !data) {
    return (
      <List isLoading={isLoading}>
        <ErrorEmptyView error={error} revalidate={revalidate} />
      </List>
    );
  }

  const readyz = data?.readyz;
  const stats = data?.stats;
  const persistence = data?.lifetime.persistence;
  const executor = readyz?.runtime?.compression_executor;
  const inbound = stats?.proxy_inbound;

  return (
    <List isLoading={isLoading} isShowingDetail={Boolean(data)} searchBarPlaceholder="Search checks and metrics">
      {readyz && stats && data && (
        <>
          <List.Section title="Status">
            <List.Item
              title={`Headroom ${readyz.version}`}
              icon={{
                source: readyz.ready ? Icon.CheckCircle : Icon.XMarkCircle,
                tintColor: statusColor(readyz.status, readyz.ready),
              }}
              accessories={[
                { tag: { value: readyz.ready ? "ready" : "not ready", color: readyz.ready ? Color.Green : Color.Red } },
                { text: `up ${formatDurationMinutes(readyz.uptime_seconds / 60)}` },
              ]}
              detail={
                <List.Item.Detail
                  markdown={headlineMarkdown(
                    readyz.ready ? "Ready" : "Not Ready",
                    `Headroom ${readyz.version} at ${baseUrl} · checked ${formatDateTime(readyz.timestamp, timezone)}`,
                  )}
                  metadata={
                    <M>
                      <M.Label
                        title="Status"
                        text={{ value: readyz.status, color: statusColor(readyz.status, readyz.ready) }}
                      />
                      <M.Label title="Version" text={readyz.version} />
                      <M.Label title="Uptime" text={formatDurationMinutes(readyz.uptime_seconds / 60)} />
                      <M.Label title="Mode" text={stats.summary?.mode ?? NO_VALUE} />
                      <M.Label title="Rust Core" text={readyz.rust_core ?? NO_VALUE} />
                      <M.Separator />
                      <M.Label title="Deployment Runtime" text={readyz.deployment?.runtime ?? NO_VALUE} />
                      <M.Label title="Deployment Preset" text={readyz.deployment?.preset ?? NO_VALUE} />
                      <M.Label title="Profile" text={readyz.deployment?.profile ?? NO_VALUE} />
                      <M.Label title="Supervisor" text={readyz.deployment?.supervisor ?? NO_VALUE} />
                    </M>
                  }
                />
              }
              actions={<StandardActions revalidate={revalidate} json={readyz} />}
            />
          </List.Section>

          <List.Section title="Checks">
            {Object.entries(readyz.checks).map(([name, check]) => (
              <CheckItem key={name} name={name} check={check} revalidate={revalidate} />
            ))}
          </List.Section>

          <List.Section title="Performance" subtitle="since the proxy process started">
            <TimingItem title="Request Latency" timing={stats.latency} icon={Icon.Clock} revalidate={revalidate} />
            <TimingItem title="Headroom Overhead" timing={stats.overhead} icon={Icon.Gauge} revalidate={revalidate} />
            <TimingItem title="Time to First Byte" timing={stats.ttfb} icon={Icon.Bolt} revalidate={revalidate} />
            {stats.throughput?.current && (
              <List.Item
                title="Throughput"
                icon={Icon.Gauge}
                accessories={[
                  { text: `${formatNumber(stats.throughput.current.generation_p50 ?? null, 0)} tok/s generation p50` },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown("Throughput", "Tokens per second over the last hour of proxy logs")}
                    metadata={
                      <M>
                        {Object.entries(stats.throughput.current).map(([key, value]) => (
                          <M.Label
                            key={key}
                            title={humanizeKey(key)}
                            text={`${formatNumber(value, 0)} tok/s (rolling ${formatNumber(stats.throughput?.rolling?.[key] ?? null, 0)})`}
                          />
                        ))}
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={stats.throughput} />}
              />
            )}
          </List.Section>

          <List.Section title="Runtime">
            {executor && (
              <List.Item
                title="Compression Executor"
                icon={Icon.ComputerChip}
                accessories={[
                  { text: `${formatInt(executor.in_flight)} in flight` },
                  { text: `${formatInt(executor.queued)} queued` },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      `${formatInt(executor.in_flight)} in flight`,
                      `Worker pool that runs compression off the event loop${executor.quarantine_active ? "\n\n> ⚠️ Quarantine is active." : ""}`,
                    )}
                    metadata={
                      <M>
                        <M.Label title="Max Workers" text={formatInt(executor.max_workers)} />
                        <M.Label title="Running" text={formatInt(executor.running)} />
                        <M.Label
                          title="In Flight (Max)"
                          text={`${formatInt(executor.in_flight)} (${formatInt(executor.in_flight_max)})`}
                        />
                        <M.Label
                          title="Queued (Max)"
                          text={`${formatInt(executor.queued)} (${formatInt(executor.queued_max)})`}
                        />
                        <M.Label title="Queue Timeouts" text={formatInt(executor.queue_timeouts_total)} />
                        <M.Label title="Longest Run" text={formatDurationMs((executor.run_seconds_max ?? 0) * 1000)} />
                        <M.Label title="Timed-Out Workers" text={formatInt(executor.timed_out_workers)} />
                        <M.Label title="Leaked Threads" text={formatInt(executor.leaked_threads_total)} />
                        <M.Label title="Quarantine Active" text={yesNo(executor.quarantine_active)} />
                        <M.Label
                          title="Upstream Concurrency"
                          text={formatInt(readyz.runtime?.anthropic_pre_upstream?.resolved_concurrency)}
                        />
                        <M.Label
                          title="WebSocket Sessions"
                          text={formatInt(readyz.runtime?.websocket_sessions?.active_sessions)}
                        />
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={readyz.runtime} />}
              />
            )}
            {inbound && (
              <List.Item
                title="Inbound HTTP"
                icon={Icon.ArrowDownCircle}
                accessories={[
                  { text: `${formatInt(inbound.active)} active` },
                  { text: `${formatInt(inbound.total)} total` },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      `${formatInt(inbound.total)} requests`,
                      "HTTP requests received since the proxy process started",
                    )}
                    metadata={
                      <M>
                        <M.Label title="Completed" text={formatInt(inbound.completed)} />
                        <M.Label title="Active" text={formatInt(inbound.active)} />
                        <M.Separator />
                        {Object.entries(inbound.by_status ?? {}).map(([status, count]) => (
                          <M.Label
                            key={status}
                            title={`HTTP ${status}`}
                            text={{ value: formatInt(count), color: status.startsWith("2") ? undefined : Color.Orange }}
                          />
                        ))}
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={inbound} />}
              />
            )}
            <List.Item
              title="Requests"
              icon={Icon.List}
              accessories={[
                { text: `${formatInt(stats.requests?.failed)} failed` },
                { text: `${formatInt(stats.requests?.rate_limited)} rate limited` },
              ]}
              detail={
                <List.Item.Detail
                  markdown={headlineMarkdown(
                    `${formatInt(stats.requests?.total)} requests`,
                    "Model requests since the proxy process started",
                  )}
                  metadata={
                    <M>
                      <M.Label title="Total" text={formatInt(stats.requests?.total)} />
                      <M.Label title="Prefix-Cache Hits" text={formatInt(stats.requests?.cached)} />
                      <M.Label title="Failed" text={formatInt(stats.requests?.failed)} />
                      <M.Label title="Rate Limited" text={formatInt(stats.requests?.rate_limited)} />
                      <M.Separator />
                      {Object.entries(stats.requests?.by_provider ?? {}).map(([provider, count]) => (
                        <M.Label key={provider} title={humanizeKey(provider)} text={formatInt(count)} />
                      ))}
                      {stats.rate_limiter && (
                        <>
                          <M.Separator />
                          <M.Label
                            title="Rate Limiter"
                            text={`${formatInt(stats.rate_limiter.requests_per_minute)} req/min · ${formatInt(stats.rate_limiter.tokens_per_minute)} tok/min`}
                          />
                        </>
                      )}
                    </M>
                  }
                />
              }
              actions={<StandardActions revalidate={revalidate} json={stats.requests} />}
            />
          </List.Section>

          <List.Section title="Storage and Integrations">
            {persistence && (
              <List.Item
                title="Savings Persistence"
                icon={{ source: Icon.HardDrive, tintColor: persistence.healthy ? Color.Green : Color.Red }}
                accessories={[
                  {
                    text: persistence.last_saved_at
                      ? `saved ${formatRelativeTime(persistence.last_saved_at)}`
                      : NO_VALUE,
                  },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      persistence.healthy ? "Healthy" : "Unhealthy",
                      `Lifetime savings stored on disk${persistence.error ? `\n\n> ${persistence.error}` : ""}`,
                    )}
                    metadata={
                      <M>
                        <M.Label title="Enabled" text={yesNo(persistence.enabled)} />
                        <M.Label title="Healthy" text={yesNo(persistence.healthy)} />
                        <M.Label title="Pending Records" text={formatInt(persistence.pending_records)} />
                        <M.Label title="Last Saved" text={formatDateTime(persistence.last_saved_at, timezone)} />
                        <M.Label title="Lifetime Since" text={formatDateTime(data.lifetime.started_at, timezone)} />
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={persistence} />}
              />
            )}
            <List.Item
              title="Observability"
              icon={Icon.Eye}
              accessories={[
                { text: `OTel ${stats.otel?.enabled ? "on" : "off"}` },
                { text: `Langfuse ${stats.langfuse?.enabled ? "on" : "off"}` },
              ]}
              detail={
                <List.Item.Detail
                  markdown={headlineMarkdown("Observability", "Exporters and request logging configured in Headroom")}
                  metadata={
                    <M>
                      <M.Label title="OpenTelemetry" text={yesNo(stats.otel?.enabled)} />
                      <M.Label title="Langfuse" text={yesNo(stats.langfuse?.enabled)} />
                      <M.Label title="Full Message Logging" text={yesNo(stats.log_full_messages)} />
                      <M.Label
                        title="Response Cache"
                        text={
                          stats.cache
                            ? `${formatInt(stats.cache.entries)} of ${formatInt(stats.cache.max_entries)} entries`
                            : NO_VALUE
                        }
                      />
                    </M>
                  }
                />
              }
              actions={
                <StandardActions revalidate={revalidate} json={{ otel: stats.otel, langfuse: stats.langfuse }} />
              }
            />
          </List.Section>
        </>
      )}
    </List>
  );
}

function CheckItem({ name, check, revalidate }: { name: string; check: ComponentCheck; revalidate: () => void }) {
  const extra = Object.entries(check).filter(
    ([key, value]) => !KNOWN_CHECK_FIELDS[key] && value !== null && typeof value !== "object",
  );
  return (
    <List.Item
      title={humanizeKey(name)}
      subtitle={check.optional ? "optional" : undefined}
      icon={{
        source: check.ready ? Icon.CheckCircle : Icon.XMarkCircle,
        tintColor: statusColor(check.status, check.ready),
      }}
      accessories={[{ tag: { value: check.status, color: statusColor(check.status, check.ready) } }]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(humanizeKey(name), check.error ? `> ${check.error}` : `Status: ${check.status}`)}
          metadata={
            <M>
              <M.Label title="Status" text={{ value: check.status, color: statusColor(check.status, check.ready) }} />
              <M.Label title="Enabled" text={yesNo(check.enabled)} />
              <M.Label title="Ready" text={yesNo(check.ready)} />
              {check.url && <M.Label title="URL" text={check.url} />}
              {check.backend && <M.Label title="Backend" text={check.backend} />}
              {check.error && <M.Label title="Error" text={{ value: check.error, color: Color.Red }} />}
              {extra.map(([key, value]) => (
                <M.Label key={key} title={humanizeKey(key)} text={String(value)} />
              ))}
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={check} />}
    />
  );
}

function TimingItem({
  title,
  timing,
  icon,
  revalidate,
}: {
  title: string;
  timing: Timing | undefined;
  icon: Icon;
  revalidate: () => void;
}) {
  if (!timing) return null;
  return (
    <List.Item
      title={title}
      icon={icon}
      accessories={[
        { text: `avg ${formatDurationMs(timing.average_ms)}` },
        { text: `max ${formatDurationMs(timing.max_ms)}` },
      ]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(
            `${formatDurationMs(timing.average_ms)} average`,
            `${title} since the proxy process started`,
          )}
          metadata={
            <M>
              <M.Label title="Average" text={formatDurationMs(timing.average_ms)} />
              <M.Label title="Minimum" text={formatDurationMs(timing.min_ms)} />
              <M.Label title="Maximum" text={formatDurationMs(timing.max_ms)} />
              <M.Label title="Requests" text={formatInt(timing.total_requests ?? timing.count)} />
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={timing} />}
    />
  );
}
