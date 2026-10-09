import { Action, Color, Icon, List } from "@raycast/api";
import type { RecentRequest } from "./api/types";
import { ErrorEmptyView, NoDataEmptyView, StandardActions } from "./components/StandardActions";
import { useStats } from "./hooks/useHeadroom";
import {
  formatDateTime,
  formatDurationMs,
  formatInt,
  formatPercent,
  formatRelativeTime,
  formatTokens,
  humanizeKey,
  NO_VALUE,
} from "./lib/format";
import { getPrefs } from "./lib/preferences";

const M = List.Item.Detail.Metadata;

const HIDDEN_DESCRIPTION =
  "Headroom shares per-request metadata only with loopback callers and trusted dashboard clients. In Docker, host requests are not loopback: set HEADROOM_PROXY_TRUSTED_DASHBOARD_CLIENT_CIDRS on the container to the gateway it sees (e.g. 192.168.215.1/32 on OrbStack, 172.17.0.1/32 on Docker's default bridge) and use an IP address, not localhost, in the Headroom URL. See the README.";

/** ISO timestamps from Headroom's request log have no zone suffix; they are UTC. */
function utcIso(timestamp: string | null): string | null {
  if (!timestamp) return null;
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`;
}

function savingsIcon(row: RecentRequest) {
  if ((row.tokens_saved ?? 0) > 0) return { source: Icon.ArrowDownCircle, tintColor: Color.Green };
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

export default function RecentRequests() {
  const { data, isLoading, error, revalidate } = useStats();
  const { timezone } = getPrefs();
  const rows = data?.recent_requests ?? [];

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={rows.length > 0}
      searchBarPlaceholder="Search requests by model, provider, transform or ID"
    >
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : data && data.recent_requests === undefined ? (
        <NoDataEmptyView
          title="Per-Request Data Not Shared"
          description={HIDDEN_DESCRIPTION}
          actions={<StandardActions revalidate={revalidate} />}
        />
      ) : data && rows.length === 0 ? (
        <NoDataEmptyView title="No Requests" description="Headroom has not proxied a request since it started." />
      ) : (
        rows.map((row, index) => {
          const at = utcIso(row.timestamp);
          return (
            <List.Item
              key={row.request_id ?? `${row.timestamp}-${index}`}
              title={row.model ?? "unknown model"}
              subtitle={row.provider ?? undefined}
              icon={savingsIcon(row)}
              keywords={[row.request_id ?? "", row.provider ?? "", ...(row.transforms_applied ?? [])].filter(Boolean)}
              accessories={[
                {
                  text: `${formatTokens(row.tokens_saved)} saved`,
                  tooltip: `${formatPercent(row.savings_percent)} of the input`,
                },
                { text: formatRelativeTime(at) },
              ]}
              detail={
                <List.Item.Detail
                  markdown={`# ${row.model ?? "Unknown model"}\n\n${formatDateTime(at, timezone)} · ${row.provider ?? NO_VALUE}${
                    row.token_accounting_status && row.token_accounting_status !== "complete"
                      ? `\n\nToken accounting: ${row.token_accounting_status}.`
                      : ""
                  }`}
                  metadata={<RequestMetadata row={row} at={at} timeZone={timezone} />}
                />
              }
              actions={
                <StandardActions revalidate={revalidate} json={row}>
                  {row.request_id && <Action.CopyToClipboard title="Copy Request ID" content={row.request_id} />}
                </StandardActions>
              }
            />
          );
        })
      )}
    </List>
  );
}

function RequestMetadata({ row, at, timeZone }: { row: RecentRequest; at: string | null; timeZone: string }) {
  const waste = Object.entries(row.waste_signals ?? {}).filter(([, tokens]) => tokens > 0);
  return (
    <M>
      <M.Label title="Request ID" text={row.request_id ?? NO_VALUE} />
      <M.Label title="Time" text={formatDateTime(at, timeZone)} />
      <M.Label title="Model" text={row.model ?? NO_VALUE} />
      <M.Label title="Provider" text={row.provider ?? NO_VALUE} />
      <M.Separator />
      <M.Label title="Input Before" text={formatInt(row.input_tokens_original)} />
      <M.Label title="Input Sent" text={formatInt(row.input_tokens_optimized)} />
      <M.Label
        title="Tokens Saved"
        text={{ value: `${formatInt(row.tokens_saved)} (${formatPercent(row.savings_percent)})`, color: Color.Green }}
      />
      {(row.tool_schema_saved_tokens ?? 0) > 0 && (
        <M.Label title="Tool Schemas Deferred" text={formatInt(row.tool_schema_saved_tokens)} />
      )}
      <M.Label title="Output" text={formatInt(row.output_tokens)} />
      <M.Label title="Exact Token Counts" text={row.has_exact_tokens ? "Yes" : "No"} />
      <M.Separator />
      <M.Label title="Total Latency" text={formatDurationMs(row.total_latency_ms)} />
      <M.Label title="Optimization Time" text={formatDurationMs(row.optimization_latency_ms)} />
      {(row.transforms_applied ?? []).length > 0 && (
        <M.TagList title="Transforms">
          {(row.transforms_applied ?? []).map((transform) => (
            <M.TagList.Item key={transform} text={transform} />
          ))}
        </M.TagList>
      )}
      {waste.length > 0 && (
        <M.TagList title="Waste Signals">
          {waste.map(([signal, tokens]) => (
            <M.TagList.Item key={signal} text={`${humanizeKey(signal)} · ${formatTokens(tokens)}`} />
          ))}
        </M.TagList>
      )}
    </M>
  );
}
