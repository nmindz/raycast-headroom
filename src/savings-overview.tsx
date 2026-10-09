import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { headlineMarkdown, windowLine } from "./components/detail";
import { ReportModelList } from "./components/ModelList";
import { SavingsMetadata } from "./components/SavingsMetadata";
import { SeriesList } from "./components/SeriesList";
import { ErrorEmptyView, StandardActions } from "./components/StandardActions";
import { useOverview } from "./hooks/useHeadroom";
import { formatDateRange, formatDateTime, formatDurationMinutes, formatUsd } from "./lib/format";
import { fromSavingsLifetime, type SavingsTotals, type WindowReport } from "./lib/history";
import { PERIOD_TITLES, USAGE_PERIODS, type PeriodId } from "./lib/periods";
import { getPrefs } from "./lib/preferences";

const M = List.Item.Detail.Metadata;

export default function SavingsOverview() {
  const { data, isLoading, error, revalidate } = useOverview();
  const { timezone } = getPrefs();

  return (
    <List isLoading={isLoading} isShowingDetail={Boolean(data)} searchBarPlaceholder="Search periods">
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : (
        data && (
          <>
            <List.Section title="Periods" subtitle={timezone}>
              {USAGE_PERIODS.map((period) => (
                <PeriodItem key={period} period={period} report={data.reports[period]} revalidate={revalidate} />
              ))}
            </List.Section>
            <List.Section title="Totals">
              <TotalsItem
                title="Current Session"
                icon={Icon.Bubble}
                totals={fromSavingsLifetime(data.session)}
                caption={
                  data.session.started_at
                    ? `Since ${formatDateTime(data.session.started_at, timezone)} · last activity ${formatDateTime(data.session.last_activity_at, timezone)}`
                    : "No session yet"
                }
                note={
                  data.sessionInactivityMinutes
                    ? `Headroom starts a new display session after ${formatDurationMinutes(data.sessionInactivityMinutes)} without requests.`
                    : undefined
                }
                json={data.session}
                revalidate={revalidate}
              />
              <TotalsItem
                title="Since Proxy Start"
                icon={Icon.Bolt}
                totals={data.runtime}
                caption="Counters of the running proxy process; they reset when Headroom restarts."
                json={data.runtime}
                revalidate={revalidate}
              />
              <TotalsItem
                title="Lifetime"
                icon={Icon.Calendar}
                totals={data.lifetime}
                caption={
                  data.lifetimeStartedAt
                    ? `Since ${formatDateTime(data.lifetimeStartedAt, timezone)}`
                    : "Persisted across restarts"
                }
                json={data.lifetime}
                revalidate={revalidate}
              />
            </List.Section>
          </>
        )
      )}
    </List>
  );
}

function PeriodItem({
  period,
  report,
  revalidate,
}: {
  period: PeriodId;
  report: WindowReport;
  revalidate: () => void;
}) {
  const { totals, previous, change } = report;
  const title = PERIOD_TITLES[period];

  return (
    <List.Item
      title={title}
      icon={report.coverage.partial ? { source: Icon.Calendar, tintColor: Color.Yellow } : Icon.Calendar}
      accessories={[
        { text: formatUsd(totals.inputCostUsd), tooltip: "Input cost" },
        {
          tag: { value: `saved ${formatUsd(totals.compressionSavingsUsd)}`, color: Color.Green },
          tooltip: "Compression savings",
        },
      ]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(
            `${formatUsd(totals.compressionSavingsUsd)} saved`,
            `${title} · ${windowLine(report)}`,
            report,
          )}
          metadata={
            <M>
              <M.Label
                title="Previous Window"
                text={
                  previous
                    ? `${formatDateRange(previous.startDate, previous.endDate)} · ${formatUsd(previous.totals.compressionSavingsUsd)} saved`
                    : "Not covered by Headroom's history"
                }
              />
              <M.Separator />
              <SavingsMetadata totals={totals} change={change} />
            </M>
          }
        />
      }
      actions={
        <StandardActions revalidate={revalidate} json={report}>
          <ActionPanel.Section>
            <Action.Push
              title={report.granularity === "hour" ? "Hourly Breakdown" : "Daily Breakdown"}
              icon={Icon.BarChart}
              target={<SeriesList report={report} title={title} />}
            />
            <Action.Push title="Models" icon={Icon.Box} target={<ReportModelList report={report} title={title} />} />
          </ActionPanel.Section>
        </StandardActions>
      }
    />
  );
}

function TotalsItem({
  title,
  icon,
  totals,
  caption,
  note,
  json,
  revalidate,
}: {
  title: string;
  icon: Icon;
  totals: SavingsTotals;
  caption: string;
  note?: string;
  json: unknown;
  revalidate: () => void;
}) {
  return (
    <List.Item
      title={title}
      icon={icon}
      accessories={[
        { text: formatUsd(totals.inputCostUsd), tooltip: "Input cost" },
        {
          tag: { value: `saved ${formatUsd(totals.compressionSavingsUsd)}`, color: Color.Green },
          tooltip: "Compression savings",
        },
      ]}
      detail={
        <List.Item.Detail
          markdown={
            headlineMarkdown(`${formatUsd(totals.compressionSavingsUsd)} saved`, `${title} · ${caption}`) +
            (note ? `\n\n${note}` : "")
          }
          metadata={
            <M>
              <SavingsMetadata totals={totals} requestsLabel="Requests" />
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={json} />}
    />
  );
}
