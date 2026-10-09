import { Icon, List } from "@raycast/api";
import { formatBucket, formatInt, formatTokens, formatUsd } from "../lib/format";
import type { WindowReport } from "../lib/history";
import { headlineMarkdown } from "./detail";
import { SavingsMetadata } from "./SavingsMetadata";
import { StandardActions } from "./StandardActions";

/** Hour-by-hour (single-day windows) or day-by-day breakdown of an already computed report. */
export function SeriesList({ report, title }: { report: WindowReport; title: string }) {
  const hourly = report.granularity === "hour";
  const series = [...report.series].reverse();

  return (
    <List
      isShowingDetail={series.length > 0}
      navigationTitle={`${hourly ? "Hourly" : "Daily"} Breakdown · ${title}`}
      searchBarPlaceholder={hourly ? "Search hours" : "Search days"}
    >
      <List.Section title={hourly ? "Hours" : "Days"} subtitle={`${title} · newest first`}>
        {series.map((point) => {
          const idle = point.totals.requests === 0 && point.totals.inputCostUsd === 0;
          return (
            <List.Item
              key={point.bucket}
              title={formatBucket(point.bucket)}
              icon={idle ? Icon.Circle : Icon.CircleFilled}
              accessories={
                idle
                  ? [{ text: "no savings recorded" }]
                  : [
                      { text: `${formatInt(point.totals.requests)} req` },
                      { text: formatUsd(point.totals.compressionSavingsUsd), tooltip: "Compression savings" },
                    ]
              }
              detail={
                <List.Item.Detail
                  markdown={headlineMarkdown(
                    `${formatUsd(point.totals.compressionSavingsUsd)} saved`,
                    `${formatBucket(point.bucket)} · ${formatTokens(point.totals.tokensSaved)} tokens saved · ${report.timezone}`,
                  )}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <SavingsMetadata totals={point.totals} />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={<StandardActions json={point} />}
            />
          );
        })}
      </List.Section>
    </List>
  );
}
