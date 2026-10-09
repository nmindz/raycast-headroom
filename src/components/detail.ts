import { formatDateRange, formatDateTime } from "../lib/format";
import type { WindowReport } from "../lib/history";

/** Warning when the window starts before the first stored savings checkpoint. */
export function coverageNote(report: WindowReport): string {
  if (!report.coverage.partial) return "";
  const start = report.coverage.historyStart
    ? formatDateTime(report.coverage.historyStart, report.timezone)
    : "no checkpoint yet";
  return `\n\n> ⚠️ Partial data: Headroom's savings history starts at ${start} and this window starts earlier. Headroom keeps a bounded number of checkpoints (5,000 by default), so older activity is not broken down by time.`;
}

export function windowLine(report: WindowReport): string {
  return `${formatDateRange(report.startDate, report.endDate)} · ${report.timezone}`;
}

/** Headline + caption block used at the top of every detail pane. */
export function headlineMarkdown(headline: string, caption: string, report?: WindowReport): string {
  return `# ${headline}\n\n${caption}${report ? coverageNote(report) : ""}`;
}
