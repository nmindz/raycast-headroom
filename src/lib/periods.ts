export type PeriodId =
  "today" | "yesterday" | "last-7-days" | "this-week" | "last-week" | "this-month" | "last-month" | "last-30-days";

export const PERIOD_TITLES: Record<PeriodId, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 Days",
  "this-week": "This Week",
  "last-week": "Last Week",
  "this-month": "This Month",
  "last-month": "Last Month",
  "last-30-days": "Last 30 Days",
};

export const USAGE_PERIODS: PeriodId[] = [
  "today",
  "yesterday",
  "last-7-days",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "last-30-days",
];

export interface DateRange {
  startDate: string;
  endDate: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Preference value when it is a valid IANA zone, otherwise the system zone. */
export function resolveTimeZone(preference?: string | null): string {
  const tz = preference?.trim();
  return tz && isValidTimeZone(tz) ? tz : systemTimeZone();
}

function toUtcDate(date: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of an instant in `timeZone`; formatters are cached per zone because this runs per history point. */
export function zonedParts(ms: number, timeZone: string): { date: string; hour: number; minute: number } {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(ms)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return zonedParts(now.getTime(), timeZone).date;
}

/** Offset (ms) of `timeZone` from UTC at instant `ms`. */
function zoneOffset(ms: number, timeZone: string): number {
  const { date, hour, minute } = zonedParts(ms, timeZone);
  const wall = toUtcDate(date).getTime() + hour * 3_600_000 + minute * 60_000;
  return wall - (ms - (ms % 60_000));
}

/** UTC instant of local midnight starting `date` in `timeZone` (DST-safe: re-checks the offset at the result). */
export function startOfDayInstant(date: string, timeZone: string): number {
  const wall = toUtcDate(date).getTime();
  const first = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(first, timeZone);
}

/** 0 = Monday … 6 = Sunday. */
function mondayIndex(date: string): number {
  return (toUtcDate(date).getUTCDay() + 6) % 7;
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function resolvePeriod(period: PeriodId, timeZone: string, now: Date = new Date()): DateRange {
  const today = todayIn(timeZone, now);
  const weekStart = addDays(today, -mondayIndex(today));

  switch (period) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { startDate: y, endDate: y };
    }
    case "last-7-days":
      return { startDate: addDays(today, -6), endDate: today };
    case "last-30-days":
      return { startDate: addDays(today, -29), endDate: today };
    case "this-week":
      return { startDate: weekStart, endDate: today };
    case "last-week":
      return { startDate: addDays(weekStart, -7), endDate: addDays(weekStart, -1) };
    case "this-month":
      return { startDate: startOfMonth(today), endDate: today };
    case "last-month": {
      const end = addDays(startOfMonth(today), -1);
      return { startDate: startOfMonth(end), endDate: end };
    }
  }
}

function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  return fromUtcDate(toUtcDate(value)) === value;
}

export interface WindowInput {
  period?: PeriodId;
  startDate?: string;
  endDate?: string;
}

export interface ResolvedWindow extends DateRange {
  timezone: string;
  /** Preset id, or "custom" when explicit dates were given. */
  period: PeriodId | "custom";
}

/** Explicit dates override the preset; a lone endDate/startDate is completed to a 7-day span. */
export function resolveWindow(
  input: WindowInput,
  defaultPeriod: PeriodId,
  timeZone: string,
  now: Date = new Date(),
): ResolvedWindow {
  const { startDate, endDate } = input;
  for (const [name, value] of [
    ["startDate", startDate],
    ["endDate", endDate],
  ] as const) {
    if (value !== undefined && !isValidDate(value)) {
      throw new Error(`${name} must be a valid date in YYYY-MM-DD format (got "${value}").`);
    }
  }

  if (startDate || endDate) {
    const today = todayIn(timeZone, now);
    const end = endDate ?? (startDate && startDate > today ? startDate : today);
    const start = startDate ?? addDays(end, -6);
    if (start > end) throw new Error(`startDate (${start}) must not be after endDate (${end}).`);
    return { startDate: start, endDate: end, timezone: timeZone, period: "custom" };
  }

  const period = input.period ?? defaultPeriod;
  return { ...resolvePeriod(period, timeZone, now), timezone: timeZone, period };
}

export function dayCountOf(range: DateRange): number {
  return Math.round((toUtcDate(range.endDate).getTime() - toUtcDate(range.startDate).getTime()) / 86_400_000) + 1;
}
