export const NO_VALUE = "—";

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) {
    // Keep two significant digits so sub-cent figures such as $0.0042 stay legible.
    const digits = Math.min(6, Math.max(4, 1 - Math.floor(Math.log10(abs))));
    return `${value < 0 ? "-" : ""}$${abs.toFixed(digits)}`;
  }
  return usdWhole.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return NO_VALUE;
  return Math.round(value).toLocaleString("en-US");
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return NO_VALUE;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return String(Math.round(value));
}

function trim(n: number): string {
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
  const fixed = value.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
  const fixed = value.toFixed(digits);
  return `${fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed}%`;
}

/** 0..1 ratio to a percent string. */
export function formatRatio(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? NO_VALUE : formatPercent(value * 100, digits);
}

export type Tone = "good" | "bad" | "neutral";

export interface Delta {
  text: string;
  tone: Tone;
}

/** `betterWhen` decides the tone: for cost a rise is bad, for savings a rise is good. */
export function formatDelta(percent: number | null | undefined, betterWhen: "up" | "down" | "none"): Delta | null {
  if (percent === null || percent === undefined) return null;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return { text: "▬ 0%", tone: "neutral" };
  const up = rounded > 0;
  const tone: Tone = betterWhen === "none" ? "neutral" : up === (betterWhen === "up") ? "good" : "bad";
  return { text: `${up ? "▲" : "▼"} ${Math.abs(rounded)}%`, tone };
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return NO_VALUE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1).replace(/\.?0+$/, "")} s`;
  if (ms < 3_600_000) {
    const totalSeconds = Math.round(ms / 1000);
    return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  }
  return formatDurationMinutes(ms / 60_000);
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return NO_VALUE;
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

/** "in 2d 3h" / "resetting" for future instants. */
export function formatTimeUntil(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return NO_VALUE;
  const diffMin = (new Date(iso).getTime() - now.getTime()) / 60_000;
  if (diffMin <= 0) return "now";
  return `in ${formatDurationMinutes(diffMin)}`;
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const diffMin = (now.getTime() - new Date(iso).getTime()) / 60_000;
  if (diffMin < 0) return formatTimeUntil(iso, now);
  if (diffMin < 1) return "just now";
  return `${formatDurationMinutes(diffMin)} ago`;
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return NO_VALUE;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 9" from a YYYY-MM-DD string (no time zone conversion involved). */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

export function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
}

/** Label for a series bucket: YYYY-MM-DD or YYYY-MM-DDTHH:00. */
export function formatBucket(bucket: string): string {
  const [date, time] = bucket.split("T");
  return time ? `${formatShortDate(date)}, ${time}` : `${formatShortDate(date)} (${weekdayOf(date)})`;
}

function weekdayOf(date: string): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function progressBar(percent: number | null | undefined, width = 10): string {
  const clamped = Math.min(100, Math.max(0, percent ?? 0));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** "cache_control_protected" / "compressor:code_aware" → "Cache Control Protected" / "Compressor: Code Aware". */
export function humanizeKey(key: string): string {
  return key
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/:/g, ": ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
