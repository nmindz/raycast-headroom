import { Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import type { ReactElement } from "react";
import { coverageNote, headlineMarkdown, windowLine } from "./components/detail";
import { ModelItem, SortSubmenu, sortSubtitle, useModelSort } from "./components/ModelList";
import { PeriodDropdown } from "./components/PeriodDropdown";
import { SavingsMetadata } from "./components/SavingsMetadata";
import { ErrorEmptyView, NoDataEmptyView, StandardActions } from "./components/StandardActions";
import { useLifetimeModels, useWindowReport } from "./hooks/useHeadroom";
import { formatDateTime, formatTokens, formatUsd } from "./lib/format";
import { emptyTotals, sortModels, type SavingsTotals } from "./lib/history";
import { PERIOD_TITLES, type PeriodId } from "./lib/periods";
import { getPrefs } from "./lib/preferences";

type Scope = PeriodId | "lifetime";

const LIFETIME_NOTE =
  "\n\nLifetime per-model figures cover compression and input cost; Headroom does not break the cache discount down by model over its lifetime.";

export default function ModelSavings() {
  const [scope, setScope] = useCachedState<Scope>("model-savings-scope", "last-7-days");
  const dropdown = (
    <PeriodDropdown<Scope> value={scope} onChange={setScope} extra={[{ value: "lifetime", title: "Lifetime" }]} />
  );
  return scope === "lifetime" ? (
    <LifetimeModels dropdown={dropdown} />
  ) : (
    <PeriodModels period={scope} dropdown={dropdown} />
  );
}

function PeriodModels({ period, dropdown }: { period: PeriodId; dropdown: ReactElement<List.Dropdown.Props> }) {
  const [sort, setSort] = useModelSort("period");
  const { data: report, isLoading, error, revalidate } = useWindowReport(period);
  const title = PERIOD_TITLES[period];
  const caption = report ? `${title} · ${windowLine(report)}` : title;
  const sortMenu = <SortSubmenu sort={sort} onChange={setSort} />;
  const rows = report ? sortModels(report.models, sort) : [];

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={rows.length > 0}
      searchBarPlaceholder="Search models"
      searchBarAccessory={dropdown}
    >
      {error && !report ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : report && rows.length === 0 ? (
        <NoDataEmptyView title="No Savings" description={`No savings checkpoints for ${title.toLowerCase()}.`} />
      ) : (
        report && (
          <>
            <List.Section title="Total">
              <List.Item
                title="All Models"
                icon={Icon.BarChart}
                accessories={[{ text: formatUsd(report.totals.compressionSavingsUsd), tooltip: "Compression savings" }]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      `${formatUsd(report.totals.compressionSavingsUsd)} saved`,
                      caption,
                      report,
                    )}
                    metadata={
                      <List.Item.Detail.Metadata>
                        <SavingsMetadata totals={report.totals} change={report.change} />
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <StandardActions revalidate={revalidate} json={report}>
                    {sortMenu}
                  </StandardActions>
                }
              />
            </List.Section>
            <List.Section title="Models" subtitle={sortSubtitle(sort)}>
              {rows.map((row) => (
                <ModelItem
                  key={row.name}
                  row={row}
                  total={report.totals}
                  caption={caption}
                  markdownNote={coverageNote(report)}
                  actions={
                    <StandardActions revalidate={revalidate} json={row}>
                      {sortMenu}
                    </StandardActions>
                  }
                />
              ))}
            </List.Section>
          </>
        )
      )}
    </List>
  );
}

function LifetimeModels({ dropdown }: { dropdown: ReactElement<List.Dropdown.Props> }) {
  const [sort, setSort] = useModelSort("lifetime");
  const { data, isLoading, error, revalidate } = useLifetimeModels();
  const { timezone } = getPrefs();
  const sortMenu = <SortSubmenu sort={sort} onChange={setSort} />;
  const rows = data ? sortModels(data.rows, sort) : [];
  const total = rows.reduce<SavingsTotals>((sum, row) => {
    for (const key of Object.keys(sum) as Array<keyof SavingsTotals>) sum[key] += row.totals[key];
    return sum;
  }, emptyTotals());
  const caption = data?.startedAt ? `Lifetime · since ${formatDateTime(data.startedAt, timezone)}` : "Lifetime";

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={rows.length > 0}
      searchBarPlaceholder="Search models"
      searchBarAccessory={dropdown}
    >
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : data && rows.length === 0 ? (
        <NoDataEmptyView title="No Requests" description="Headroom has not recorded any model yet." />
      ) : (
        <List.Section title="Models" subtitle={sortSubtitle(sort)}>
          {rows.map((row) => (
            <ModelItem
              key={row.name}
              row={row}
              total={total}
              caption={caption}
              requestsLabel="Requests"
              markdownNote={LIFETIME_NOTE}
              extraMetadata={
                <>
                  <List.Item.Detail.Metadata.Label title="Output Tokens" text={formatTokens(row.outputTokens)} />
                  <List.Item.Detail.Metadata.Label
                    title="Last Activity"
                    text={formatDateTime(row.lastActivityAt, timezone)}
                  />
                </>
              }
              actions={
                <StandardActions revalidate={revalidate} json={row}>
                  {sortMenu}
                </StandardActions>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
