import { formatPercent, NO_VALUE } from "./format";

export type QuotaDisplay = "consumed" | "remaining";

/** `consumed` is the utilization percent; the remaining view is derived from it. */
export function shownPercent(consumed: number | null | undefined, display: QuotaDisplay): string {
  if (consumed === null || consumed === undefined) return NO_VALUE;
  return formatPercent(display === "remaining" ? Math.max(0, 100 - consumed) : consumed, 0);
}

export function percentText(label: string, consumed: number | null | undefined, display: QuotaDisplay): string {
  return `${label} ${shownPercent(consumed, display)}`;
}

export function displaySuffix(display: QuotaDisplay): string {
  return display === "remaining" ? "left" : "used";
}
