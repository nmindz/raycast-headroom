import {
  Color,
  Icon,
  Keyboard,
  LaunchType,
  MenuBarExtra,
  getPreferenceValues,
  launchCommand,
  open,
  openCommandPreferences,
} from "@raycast/api";
import { type SubscriptionResult } from "./api/client";
import type { RateWindow } from "./api/types";
import { dashboardUrl, errorTitle } from "./components/StandardActions";
import { useMenuBarData } from "./hooks/useHeadroom";
import {
  formatDateTime,
  formatDurationMinutes,
  formatInt,
  formatPercent,
  formatTimeUntil,
  formatTokens,
  formatUsd,
  progressBar,
} from "./lib/format";
import { combinedSavingsUsd, fromSavingsLifetime, tokenSavingsPercent, type SavingsTotals } from "./lib/history";
import { getPrefs } from "./lib/preferences";
import { displaySuffix, percentText, shownPercent, type QuotaDisplay } from "./lib/quota";

type MenuBarTitle =
  | "todaySavings"
  | "todaySavingsTokens"
  | "todayCacheDiscount"
  | "todayCombinedSavings"
  | "todayInputCost"
  | "todayTokenSavingsPercent"
  | "sessionSavings"
  | "lifetimeSavings"
  | "cacheHitRate"
  | "fiveHourQuota"
  | "sevenDayQuota"
  | "bothQuotas"
  | "none";

interface MenuBarPreferences {
  menuBarTitle?: MenuBarTitle;
}

interface TitleInputs {
  today: SavingsTotals;
  session: SavingsTotals;
  lifetime: SavingsTotals;
  cacheHitRate: number | null;
  anthropic: SubscriptionResult;
  display: QuotaDisplay;
}

function quotaTitle(anthropic: SubscriptionResult, windows: Array<"five_hour" | "seven_day">, display: QuotaDisplay) {
  const latest = anthropic.available ? anthropic.data.latest : null;
  if (!latest) return undefined;
  const shown = windows
    .map((key) => percentText(key === "five_hour" ? "5h" : "7d", latest[key].utilization_pct, display))
    .join(" · ");
  return display === "remaining" ? `${shown} left` : shown;
}

function menuTitle(choice: MenuBarTitle, inputs: TitleInputs): string | undefined {
  const { today, session, lifetime, cacheHitRate, anthropic, display } = inputs;
  switch (choice) {
    case "todaySavings":
      return formatUsd(today.compressionSavingsUsd);
    case "todaySavingsTokens":
      return `${formatUsd(today.compressionSavingsUsd)} · ${formatTokens(today.tokensSaved)}`;
    case "todayCacheDiscount":
      return `cache ${formatUsd(today.cacheSavingsUsd)}`;
    case "todayCombinedSavings":
      return `saved ${formatUsd(combinedSavingsUsd(today))}`;
    case "todayInputCost":
      return `cost ${formatUsd(today.inputCostUsd)}`;
    case "todayTokenSavingsPercent":
      return `${formatPercent(tokenSavingsPercent(today), 2)} saved`;
    case "sessionSavings":
      return `session ${formatUsd(session.compressionSavingsUsd)}`;
    case "lifetimeSavings":
      return `lifetime ${formatUsd(lifetime.compressionSavingsUsd)}`;
    case "cacheHitRate":
      return `hit ${formatPercent(cacheHitRate)}`;
    case "fiveHourQuota":
      return quotaTitle(anthropic, ["five_hour"], display);
    case "sevenDayQuota":
      return quotaTitle(anthropic, ["seven_day"], display);
    case "bothQuotas":
      return quotaTitle(anthropic, ["five_hour", "seven_day"], display);
    case "none":
      return undefined;
  }
}

function launch(name: string) {
  return () => launchCommand({ name, type: LaunchType.UserInitiated });
}

function windowSubtitle(window: RateWindow, display: QuotaDisplay): string {
  const reset = window.resets_at ? ` · resets ${formatTimeUntil(window.resets_at)}` : "";
  return `${progressBar(window.utilization_pct, 8)} ${shownPercent(window.utilization_pct, display)}${reset}`;
}

export default function MenuBar() {
  const { menuBarTitle = "todaySavings" } = getPreferenceValues<MenuBarPreferences>();
  const { quotaDisplay, timezone } = getPrefs();
  const { data, isLoading, error, revalidate } = useMenuBarData();

  const today = data?.today.totals;
  const session = data ? fromSavingsLifetime(data.session) : undefined;
  const latest = data?.anthropic.available ? data.anthropic.data.latest : null;
  const title =
    data && today && session
      ? menuTitle(menuBarTitle, {
          today,
          session,
          lifetime: data.lifetime,
          cacheHitRate: data.cacheHitRate,
          anthropic: data.anthropic,
          display: quotaDisplay,
        })
      : undefined;
  const unhealthy = data ? !data.livez.alive : false;

  return (
    <MenuBarExtra
      icon={{ source: Icon.Gauge, tintColor: (error && !data) || unhealthy ? Color.Red : undefined }}
      title={error && !data ? "⚠" : title}
      isLoading={isLoading}
      tooltip={today ? `Headroom · saved ${formatUsd(today.compressionSavingsUsd)} today` : "Headroom"}
    >
      {error && !data ? (
        <MenuBarExtra.Section title={errorTitle(error)}>
          <MenuBarExtra.Item title={error.message} />
          <MenuBarExtra.Item title="Open Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
        </MenuBarExtra.Section>
      ) : (
        data &&
        today &&
        session && (
          <>
            <MenuBarExtra.Section title="Today">
              <MenuBarExtra.Item title="Compression Savings" subtitle={formatUsd(today.compressionSavingsUsd)} />
              <MenuBarExtra.Item
                title="Tokens Saved"
                subtitle={`${formatTokens(today.tokensSaved)} (${formatPercent(tokenSavingsPercent(today), 2)})`}
              />
              <MenuBarExtra.Item title="Cache Discount" subtitle={formatUsd(today.cacheSavingsUsd)} />
              <MenuBarExtra.Item title="Input Cost" subtitle={formatUsd(today.inputCostUsd)} />
            </MenuBarExtra.Section>
            <MenuBarExtra.Section title="Session">
              <MenuBarExtra.Item title="Compression Savings" subtitle={formatUsd(session.compressionSavingsUsd)} />
              <MenuBarExtra.Item title="Requests" subtitle={formatInt(session.requests)} />
              <MenuBarExtra.Item
                title="Started"
                subtitle={formatDateTime(data.session.started_at, timezone)}
                onAction={launch("savings-overview")}
              />
            </MenuBarExtra.Section>
            <MenuBarExtra.Section title="Lifetime">
              <MenuBarExtra.Item
                title="Compression Savings"
                subtitle={formatUsd(data.lifetime.compressionSavingsUsd)}
              />
              <MenuBarExtra.Item title="Cache Discount" subtitle={formatUsd(data.lifetime.cacheSavingsUsd)} />
              <MenuBarExtra.Item title="Tokens Saved" subtitle={formatTokens(data.lifetime.tokensSaved)} />
            </MenuBarExtra.Section>
            <MenuBarExtra.Section title="Proxy">
              <MenuBarExtra.Item
                title={`Headroom ${data.livez.version}`}
                icon={{ source: Icon.CircleFilled, tintColor: unhealthy ? Color.Red : Color.Green }}
                subtitle={`${data.livez.status} · up ${formatDurationMinutes(data.livez.uptime_seconds / 60)}`}
                onAction={launch("proxy-health")}
              />
              <MenuBarExtra.Item
                title="Cache Hit Rate"
                subtitle={formatPercent(data.cacheHitRate)}
                onAction={launch("prefix-cache")}
              />
            </MenuBarExtra.Section>
            {latest && (
              <MenuBarExtra.Section title={`Anthropic (${displaySuffix(quotaDisplay)})`}>
                <MenuBarExtra.Item
                  title="5 Hours"
                  subtitle={windowSubtitle(latest.five_hour, quotaDisplay)}
                  onAction={launch("subscription-quotas")}
                />
                <MenuBarExtra.Item
                  title="7 Days"
                  subtitle={windowSubtitle(latest.seven_day, quotaDisplay)}
                  onAction={launch("subscription-quotas")}
                />
              </MenuBarExtra.Section>
            )}
          </>
        )
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Open Savings Overview" icon={Icon.BarChart} onAction={launch("savings-overview")} />
        <MenuBarExtra.Item title="Open Compression Stats" icon={Icon.Hammer} onAction={launch("compression-stats")} />
        <MenuBarExtra.Item title="Open Dashboard" icon={Icon.Globe} onAction={() => open(dashboardUrl())} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={revalidate}
        />
        <MenuBarExtra.Item title="Open Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
