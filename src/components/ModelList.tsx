import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import type { ReactNode } from "react";
import { formatPercent, formatTokens, formatUsd, progressBar } from "../lib/format";
import {
  MODEL_SORTS,
  sortModels,
  type ModelSort,
  type NamedTotals,
  type SavingsTotals,
  type WindowReport,
} from "../lib/history";
import { coverageNote, headlineMarkdown, windowLine } from "./detail";
import { SavingsMetadata, type RequestsLabel } from "./SavingsMetadata";
import { NoDataEmptyView, StandardActions } from "./StandardActions";

export function useModelSort(key: string) {
  return useCachedState<ModelSort>(`model-sort-${key}`, "compression");
}

export function sortSubtitle(sort: ModelSort): string {
  return `sorted by ${MODEL_SORTS.find((option) => option.value === sort)?.title.toLowerCase()}`;
}

export function SortSubmenu({ sort, onChange }: { sort: ModelSort; onChange: (sort: ModelSort) => void }) {
  return (
    <ActionPanel.Submenu title="Sort Results…" icon={Icon.ArrowDown}>
      {MODEL_SORTS.map((option) => (
        <Action
          key={option.value}
          title={option.title}
          icon={sort === option.value ? Icon.Checkmark : undefined}
          onAction={() => onChange(option.value)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** One ranked model row with its share of the scope's totals. */
export function ModelItem({
  row,
  total,
  caption,
  requestsLabel,
  extraMetadata,
  markdownNote = "",
  actions,
}: {
  row: NamedTotals;
  total: SavingsTotals;
  caption: string;
  requestsLabel?: RequestsLabel;
  extraMetadata?: ReactNode;
  markdownNote?: string;
  actions: ReactNode;
}) {
  const savingsShare = share(row.totals.compressionSavingsUsd, total.compressionSavingsUsd);
  const costShare = share(row.totals.inputCostUsd, total.inputCostUsd);
  const tokensShare = share(row.totals.tokensSaved, total.tokensSaved);
  return (
    <List.Item
      title={row.name}
      icon={Icon.Box}
      subtitle={formatPercent(savingsShare)}
      accessories={[{ text: formatUsd(row.totals.compressionSavingsUsd), tooltip: "Compression savings" }]}
      detail={
        <List.Item.Detail
          markdown={
            headlineMarkdown(`${formatUsd(row.totals.compressionSavingsUsd)} saved`, `**${row.name}** · ${caption}`) +
            markdownNote
          }
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Savings Share"
                text={`${progressBar(savingsShare)} ${formatPercent(savingsShare)}`}
              />
              <List.Item.Detail.Metadata.Label
                title="Input Cost Share"
                text={`${progressBar(costShare)} ${formatPercent(costShare)}`}
              />
              <List.Item.Detail.Metadata.Label
                title="Tokens Saved Share"
                text={`${progressBar(tokensShare)} ${formatPercent(tokensShare)} (${formatTokens(row.totals.tokensSaved)})`}
              />
              {extraMetadata}
              <List.Item.Detail.Metadata.Separator />
              <SavingsMetadata totals={row.totals} requestsLabel={requestsLabel} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={actions}
    />
  );
}

/** Models of an already computed report (pushed from Savings Overview). */
export function ReportModelList({ report, title }: { report: WindowReport; title: string }) {
  const [sort, setSort] = useModelSort("report");
  const rows = sortModels(report.models, sort);
  const caption = `${title} · ${windowLine(report)}`;
  const sortMenu = <SortSubmenu sort={sort} onChange={setSort} />;

  return (
    <List isShowingDetail={rows.length > 0} navigationTitle={`Models · ${title}`} searchBarPlaceholder="Search models">
      {rows.length === 0 ? (
        <NoDataEmptyView title="No Savings" description={`No savings checkpoints for ${title.toLowerCase()}.`} />
      ) : (
        <List.Section title="Models" subtitle={sortSubtitle(sort)}>
          {rows.map((row) => (
            <ModelItem
              key={row.name}
              row={row}
              total={report.totals}
              caption={caption}
              markdownNote={coverageNote(report)}
              actions={<StandardActions json={row}>{sortMenu}</StandardActions>}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
