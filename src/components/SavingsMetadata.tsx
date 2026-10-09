import { type Color, List } from "@raycast/api";
import { formatDelta, formatInt, formatPercent, formatTokens, formatUsd } from "../lib/format";
import {
  combinedSavingsUsd,
  costWithoutHeadroomUsd,
  tokenSavingsPercent,
  type SavingsTotals,
  type WindowChange,
} from "../lib/history";
import { toneColor } from "./theme";

const M = List.Item.Detail.Metadata;

type Label = { value: string; color?: Color };

function trend(percent: number | null | undefined, betterWhen: "up" | "down"): Label | undefined {
  const delta = formatDelta(percent, betterWhen);
  return delta ? { value: `${delta.text} vs previous`, color: toneColor(delta.tone) } : undefined;
}

/** Labels for the `requests` counter, whose meaning depends on the source (see SavingsTotals). */
export type RequestsLabel = "Requests" | "Requests With Savings";

/** Metadata block shared by every savings view: compression, input cost, provider cache discount, volume. */
export function SavingsMetadata({
  totals,
  change,
  requestsLabel = "Requests With Savings",
}: {
  totals: SavingsTotals;
  change?: WindowChange | null;
  requestsLabel?: RequestsLabel;
}) {
  const savingsTrend = trend(change?.compressionSavingsPercent, "up");
  const tokensTrend = trend(change?.tokensSavedPercent, "up");
  const costTrend = trend(change?.inputCostPercent, "down");
  const cacheTrend = trend(change?.cacheSavingsPercent, "up");

  return (
    <>
      <M.Label
        title="Compression Savings"
        text={{ value: formatUsd(totals.compressionSavingsUsd), color: toneColor("good") }}
      />
      {savingsTrend && <M.Label title="Savings Trend" text={savingsTrend} />}
      <M.Label title="Tokens Saved" text={formatTokens(totals.tokensSaved)} />
      {tokensTrend && <M.Label title="Tokens Saved Trend" text={tokensTrend} />}
      <M.Label title="Token Savings" text={formatPercent(tokenSavingsPercent(totals), 2)} />
      {totals.outputTokensSaved > 0 && (
        <M.Label
          title="Output Tokens Saved"
          text={`${formatTokens(totals.outputTokensSaved)} · ${formatUsd(totals.outputSavingsUsd)}`}
        />
      )}
      <M.Separator />
      <M.Label title="Input Cost" text={formatUsd(totals.inputCostUsd)} />
      {costTrend && <M.Label title="Input Cost Trend" text={costTrend} />}
      <M.Label title="Cost Without Headroom" text={formatUsd(costWithoutHeadroomUsd(totals))} />
      <M.Label title="Input Tokens Sent" text={formatTokens(totals.inputTokens)} />
      <M.Separator />
      <M.Label title="Provider Cache Discount" text={formatUsd(totals.cacheSavingsUsd)} />
      {cacheTrend && <M.Label title="Cache Discount Trend" text={cacheTrend} />}
      <M.Label title="Cache Read Tokens" text={formatTokens(totals.cacheReadTokens)} />
      <M.Label title="Combined Savings" text={formatUsd(combinedSavingsUsd(totals))} />
      <M.Separator />
      <M.Label title={requestsLabel} text={formatInt(totals.requests)} />
    </>
  );
}
