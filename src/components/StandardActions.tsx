import { Action, ActionPanel, Icon, Keyboard, List, Toast, openExtensionPreferences, showToast } from "@raycast/api";
import type { ReactNode } from "react";
import { getLivez, getStatsLifetime, HeadroomError } from "../api/client";
import { formatDurationMinutes } from "../lib/format";
import { getPrefs } from "../lib/preferences";

interface StandardActionsProps {
  /** Command-specific actions, shown first. */
  children?: ReactNode;
  revalidate?: () => void;
  /** Serialised as pretty JSON for "Copy JSON". */
  json?: unknown;
}

export function dashboardUrl(): string {
  return `${getPrefs().baseUrl}/dashboard`;
}

export function StandardActions({ children, revalidate, json }: StandardActionsProps) {
  return (
    <ActionPanel>
      {children}
      <ActionPanel.Section>
        {revalidate && (
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
        )}
        {json !== undefined && (
          <Action.CopyToClipboard
            title="Copy JSON"
            icon={Icon.Clipboard}
            content={JSON.stringify(json, null, 2)}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
        )}
        <Action.OpenInBrowser title="Open Dashboard" url={dashboardUrl()} shortcut={{ modifiers: ["cmd"], key: "d" }} />
        <Action title="Open Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        <Action title="Test Connection" icon={Icon.Plug} onAction={testConnection} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

export function errorTitle(error: Error): string {
  if (!(error instanceof HeadroomError)) return "Something Went Wrong";
  switch (error.kind) {
    case "unauthorized":
      return "Proxy Token Required";
    case "not_found":
      return "Endpoint Not Available";
    case "unavailable":
      return "Not Enabled in Headroom";
    case "network":
    case "timeout":
      return "Cannot Reach Headroom";
    case "config":
      return "Extension Not Configured";
    default:
      return "Headroom Error";
  }
}

/**
 * `/livez` proves the proxy answers; `/stats-lifetime` proves the token, because health probes are exempt from
 * Headroom's proxy-token check.
 */
async function testConnection() {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Testing connection…" });
  try {
    const [livez, lifetime] = await Promise.all([getLivez(), getStatsLifetime()]);
    toast.style = livez.alive ? Toast.Style.Success : Toast.Style.Failure;
    toast.title = livez.alive ? `Connected to Headroom ${livez.version}` : `Headroom ${livez.version} is unhealthy`;
    toast.message = `up ${formatDurationMinutes(livez.uptime_seconds / 60)} · ${lifetime.requests.total.toLocaleString("en-US")} requests recorded · ${getPrefs().baseUrl}`;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    toast.style = Toast.Style.Failure;
    toast.title = errorTitle(failure);
    toast.message = failure.message;
  }
}

/** Drop-in `List.EmptyView` for a failed request, with a shortcut to the preferences. */
export function ErrorEmptyView({ error, revalidate }: { error: Error; revalidate?: () => void }) {
  return (
    <List.EmptyView
      icon={Icon.ExclamationMark}
      title={errorTitle(error)}
      description={error.message}
      actions={
        <ActionPanel>
          <Action title="Open Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
          <Action title="Test Connection" icon={Icon.Plug} onAction={testConnection} />
          {revalidate && (
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={revalidate}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

export function NoDataEmptyView({
  title = "No Data",
  description,
  actions,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <List.EmptyView icon={Icon.BarChart} title={title} description={description} actions={actions} />;
}
