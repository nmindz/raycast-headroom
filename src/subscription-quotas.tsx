import { Color, Icon, List } from "@raycast/api";
import type { CodexWindow, CopilotCategory, RateWindow, SubscriptionWindowResponse } from "./api/types";
import { headlineMarkdown } from "./components/detail";
import { ErrorEmptyView, StandardActions } from "./components/StandardActions";
import { utilizationColor } from "./components/theme";
import { useSubscription } from "./hooks/useHeadroom";
import {
  formatDateTime,
  formatInt,
  formatPercent,
  formatRelativeTime,
  formatTimeUntil,
  formatTokens,
  formatUsd,
  humanizeKey,
  NO_VALUE,
  progressBar,
} from "./lib/format";
import { getPrefs } from "./lib/preferences";
import { displaySuffix, shownPercent, type QuotaDisplay } from "./lib/quota";

const M = List.Item.Detail.Metadata;

const ANTHROPIC_WINDOWS: Array<{
  key: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet";
  title: string;
}> = [
  { key: "five_hour", title: "5-Hour Window" },
  { key: "seven_day", title: "7-Day Window" },
  { key: "seven_day_opus", title: "7-Day Opus" },
  { key: "seven_day_sonnet", title: "7-Day Sonnet" },
];

const NO_SNAPSHOT_NOTE =
  "Headroom reads these windows from Anthropic's OAuth usage API with the Claude subscription credentials it sees. Proxies that forward with an API key or to another gateway have no subscription data.";

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export default function SubscriptionQuotas() {
  const { data, isLoading, error, revalidate } = useSubscription();
  const { quotaDisplay, timezone } = getPrefs();
  const codex = data?.quota.codex_rate_limits;
  const copilot = data?.quota.copilot_quota?.latest;

  return (
    <List isLoading={isLoading} isShowingDetail={Boolean(data)} searchBarPlaceholder="Search quotas">
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : (
        data && (
          <>
            <List.Section title="Anthropic" subtitle={displaySuffix(quotaDisplay)}>
              {data.anthropic.available ? (
                <AnthropicItems
                  state={data.anthropic.data}
                  display={quotaDisplay}
                  timeZone={timezone}
                  revalidate={revalidate}
                />
              ) : (
                <List.Item
                  title="Subscription Tracking"
                  icon={{ source: Icon.MinusCircle, tintColor: Color.SecondaryText }}
                  accessories={[{ tag: "not enabled" }]}
                  detail={<List.Item.Detail markdown={headlineMarkdown("Not Enabled", data.anthropic.reason)} />}
                  actions={<StandardActions revalidate={revalidate} />}
                />
              )}
            </List.Section>

            {codex && (
              <List.Section title="OpenAI Codex" subtitle={codex.limit_name ?? undefined}>
                {[
                  { title: "Primary Window", window: codex.primary },
                  { title: "Secondary Window", window: codex.secondary },
                ].map(
                  ({ title, window }) =>
                    window && (
                      <CodexItem
                        key={title}
                        title={title}
                        window={window}
                        display={quotaDisplay}
                        timeZone={timezone}
                        revalidate={revalidate}
                      />
                    ),
                )}
                {codex.credits && (
                  <List.Item
                    title="Credits"
                    icon={Icon.Coins}
                    accessories={[
                      { text: codex.credits.unlimited ? "unlimited" : (codex.credits.balance ?? NO_VALUE) },
                    ]}
                    detail={
                      <List.Item.Detail
                        markdown={headlineMarkdown(
                          codex.credits.unlimited ? "Unlimited" : (codex.credits.balance ?? NO_VALUE),
                          `Codex credits · captured ${formatRelativeTime(unixToIso(codex.captured_at))}${codex.promo_message ? `\n\n${codex.promo_message}` : ""}`,
                        )}
                      />
                    }
                    actions={<StandardActions revalidate={revalidate} json={codex.credits} />}
                  />
                )}
              </List.Section>
            )}

            {copilot && (
              <List.Section title="GitHub Copilot" subtitle={copilot.copilot_plan ?? undefined}>
                {Object.values(copilot.categories).map((category) => (
                  <CopilotItem
                    key={category.name}
                    category={category}
                    display={quotaDisplay}
                    resetDate={copilot.quota_reset_date_utc}
                    login={copilot.login}
                    revalidate={revalidate}
                  />
                ))}
              </List.Section>
            )}
          </>
        )
      )}
    </List>
  );
}

function windowSubtitle(window: RateWindow): string | undefined {
  if (window.synthesized) return "estimated since reset";
  if (window.resets_at_estimated) return "reset estimated";
  return undefined;
}

function AnthropicItems({
  state,
  display,
  timeZone,
  revalidate,
}: {
  state: SubscriptionWindowResponse;
  display: QuotaDisplay;
  timeZone: string;
  revalidate: () => void;
}) {
  const latest = state.latest;
  const contribution = state.contribution;

  return (
    <>
      {latest ? (
        ANTHROPIC_WINDOWS.map(({ key, title }) => {
          const window = latest[key];
          if (!window) return null;
          return (
            <List.Item
              key={key}
              title={title}
              subtitle={windowSubtitle(window)}
              icon={{ source: Icon.Gauge, tintColor: utilizationColor(window.utilization_pct) }}
              accessories={[
                { text: `${progressBar(window.utilization_pct, 10)} ${shownPercent(window.utilization_pct, display)}` },
                { text: window.resets_at ? `resets ${formatTimeUntil(window.resets_at)}` : NO_VALUE },
              ]}
              detail={
                <List.Item.Detail
                  markdown={headlineMarkdown(
                    `${shownPercent(window.utilization_pct, display)} ${displaySuffix(display)}`,
                    `Anthropic ${title.toLowerCase()} · polled ${formatDateTime(latest.polled_at, timeZone)}${
                      window.synthesized
                        ? "\n\n> The window reset after the last poll; utilization is estimated from local Claude transcripts until the next poll."
                        : ""
                    }${window.render_warning ? `\n\n> ⚠️ ${window.render_warning}` : ""}`,
                  )}
                  metadata={
                    <M>
                      <M.Label
                        title="Utilization"
                        text={{
                          value: formatPercent(window.utilization_pct),
                          color: utilizationColor(window.utilization_pct),
                        }}
                      />
                      <M.Label title="Remaining" text={formatPercent(Math.max(0, 100 - window.utilization_pct))} />
                      <M.Label title="Used / Limit" text={`${formatInt(window.used)} / ${formatInt(window.limit)}`} />
                      <M.Label title="Resets" text={formatDateTime(window.resets_at, timeZone)} />
                      <M.Label title="Resets In" text={formatTimeUntil(window.resets_at)} />
                      <M.Label
                        title="Estimated"
                        text={window.synthesized || window.resets_at_estimated ? "Yes" : "No"}
                      />
                    </M>
                  }
                />
              }
              actions={<StandardActions revalidate={revalidate} json={window} />}
            />
          );
        })
      ) : (
        <List.Item
          title="No Usage Snapshot"
          icon={{ source: Icon.QuestionMarkCircle, tintColor: Color.SecondaryText }}
          accessories={[{ text: `${formatInt(state.poll_errors)} poll errors` }]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                "No Usage Snapshot Yet",
                `${NO_SNAPSHOT_NOTE}${state.last_error ? `\n\nLast error: \`${state.last_error}\`` : ""}`,
              )}
              metadata={
                <M>
                  <M.Label title="Successful Polls" text={formatInt(state.poll_count)} />
                  <M.Label title="Poll Errors" text={formatInt(state.poll_errors)} />
                  <M.Label title="Last Error" text={state.last_error ?? NO_VALUE} />
                  <M.Label title="Last Activity" text={formatDateTime(state.last_active_at, timeZone)} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={state} />}
        />
      )}

      {latest?.extra_usage?.is_enabled && (
        <List.Item
          title="Extra Usage"
          icon={{ source: Icon.Coins, tintColor: utilizationColor(latest.extra_usage.utilization_pct) }}
          accessories={[
            {
              text: `${formatUsd(latest.extra_usage.used_credits_usd)} of ${formatUsd(latest.extra_usage.monthly_limit_usd)}`,
            },
          ]}
          detail={
            <List.Item.Detail
              markdown={headlineMarkdown(
                formatUsd(latest.extra_usage.used_credits_usd),
                "Pay-as-you-go usage beyond the subscription this month",
              )}
              metadata={
                <M>
                  <M.Label title="Used" text={formatUsd(latest.extra_usage.used_credits_usd)} />
                  <M.Label title="Monthly Limit" text={formatUsd(latest.extra_usage.monthly_limit_usd)} />
                  <M.Label title="Utilization" text={formatPercent(latest.extra_usage.utilization_pct)} />
                </M>
              }
            />
          }
          actions={<StandardActions revalidate={revalidate} json={latest.extra_usage} />}
        />
      )}

      <List.Item
        title="Headroom Contribution"
        icon={{ source: Icon.Leaf, tintColor: Color.Green }}
        accessories={[{ text: `${formatTokens(contribution.tokens_saved.total)} saved` }]}
        detail={
          <List.Item.Detail
            markdown={headlineMarkdown(
              `${formatTokens(contribution.tokens_saved.total)} tokens saved`,
              "Tokens Headroom kept out of the current 5-hour window (counters reset when the window rolls over)",
            )}
            metadata={
              <M>
                <M.Label title="Tokens Forwarded" text={formatTokens(contribution.tokens_submitted)} />
                <M.Label title="Without Headroom" text={formatTokens(contribution.raw_without_headroom)} />
                <M.Label title="Removed by Compression" text={formatTokens(contribution.tokens_saved.compression)} />
                <M.Label title="Served From Cache" text={formatTokens(contribution.tokens_saved.cache_reads)} />
                <M.Label title="Compression Efficiency" text={formatPercent(contribution.efficiency_pct)} />
                <M.Separator />
                <M.Label title="Compression Savings" text={formatUsd(contribution.savings_usd.compression)} />
                <M.Label title="Cache Savings" text={formatUsd(contribution.savings_usd.cache)} />
                {state.window_tokens && (
                  <>
                    <M.Separator />
                    <M.Label title="Window Input" text={formatTokens(state.window_tokens.input)} />
                    <M.Label title="Window Output" text={formatTokens(state.window_tokens.output)} />
                    <M.Label title="Window Cache Reads" text={formatTokens(state.window_tokens.cache_reads)} />
                    <M.Label title="Window Cache Writes" text={formatTokens(state.window_tokens.cache_writes_total)} />
                  </>
                )}
              </M>
            }
          />
        }
        actions={<StandardActions revalidate={revalidate} json={contribution} />}
      />

      {(state.discrepancies ?? []).map((item, index) => (
        <List.Item
          key={`${item.kind}-${index}`}
          title={humanizeKey(item.kind)}
          subtitle={item.severity}
          icon={{ source: Icon.Warning, tintColor: item.severity === "alert" ? Color.Red : Color.Yellow }}
          accessories={[{ text: item.delta_pct === null ? NO_VALUE : `Δ ${formatPercent(item.delta_pct)}` }]}
          detail={<List.Item.Detail markdown={headlineMarkdown(humanizeKey(item.kind), item.description)} />}
          actions={<StandardActions revalidate={revalidate} json={item} />}
        />
      ))}
    </>
  );
}

function CodexItem({
  title,
  window,
  display,
  timeZone,
  revalidate,
}: {
  title: string;
  window: CodexWindow;
  display: QuotaDisplay;
  timeZone: string;
  revalidate: () => void;
}) {
  const resetsAt = unixToIso(window.resets_at);
  return (
    <List.Item
      title={title}
      subtitle={window.window_label}
      icon={{ source: Icon.Gauge, tintColor: utilizationColor(window.used_percent) }}
      accessories={[
        { text: `${progressBar(window.used_percent, 10)} ${shownPercent(window.used_percent, display)}` },
        { text: resetsAt ? `resets ${formatTimeUntil(resetsAt)}` : NO_VALUE },
      ]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(
            `${shownPercent(window.used_percent, display)} ${displaySuffix(display)}`,
            `Codex ${title.toLowerCase()} (${window.window_label})`,
          )}
          metadata={
            <M>
              <M.Label title="Used" text={formatPercent(window.used_percent)} />
              <M.Label title="Window" text={window.window_label} />
              <M.Label title="Resets" text={formatDateTime(resetsAt, timeZone)} />
              <M.Label title="Resets In" text={formatTimeUntil(resetsAt)} />
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={window} />}
    />
  );
}

function CopilotItem({
  category,
  display,
  resetDate,
  login,
  revalidate,
}: {
  category: CopilotCategory;
  display: QuotaDisplay;
  resetDate: string | null;
  login: string | null;
  revalidate: () => void;
}) {
  const shown = category.unlimited ? "unlimited" : shownPercent(category.used_percent, display);
  return (
    <List.Item
      title={humanizeKey(category.name)}
      icon={{ source: Icon.Gauge, tintColor: utilizationColor(category.used_percent) }}
      accessories={[
        { text: category.unlimited ? "unlimited" : `${progressBar(category.used_percent, 10)} ${shown}` },
        { text: `${formatInt(category.remaining)} left` },
      ]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(
            category.unlimited ? "Unlimited" : `${shown} ${displaySuffix(display)}`,
            `Copilot ${humanizeKey(category.name).toLowerCase()}${login ? ` · ${login}` : ""}`,
          )}
          metadata={
            <M>
              <M.Label title="Used" text={`${formatInt(category.used)} of ${formatInt(category.entitlement)}`} />
              <M.Label title="Remaining" text={formatInt(category.remaining)} />
              <M.Label title="Used Percent" text={formatPercent(category.used_percent)} />
              <M.Label
                title="Overage"
                text={`${formatInt(category.overage_count)} (${category.overage_permitted ? "permitted" : "not permitted"})`}
              />
              <M.Label title="Resets" text={resetDate ?? NO_VALUE} />
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={category} />}
    />
  );
}
