/**
 * Due-date helpers. `due` is floating local time: `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, never
 * converted through UTC.
 *
 * R38: this module is the one place that reads the locale preferences — week start, 12/24-hour
 * clock and day/month order. Every displayed date, time and week boundary goes through a helper
 * here; a bare `format()` in a component is a bug. The wire format (`formatDue`, `toDateKey`)
 * stays ISO whatever the preferences say.
 */
import { addDays, differenceInCalendarDays, format, isSameYear, startOfDay, startOfWeek } from "date-fns";
import { localePrefs, type DateOrder, type WeekStart } from "./locale";

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
  none: "No date",
};

export const BUCKET_ORDER: readonly DueBucket[] = ["overdue", "today", "tomorrow", "week", "later", "none"];

export interface ParsedDue {
  /** Local Date (midnight when no time). */
  date: Date;
  hasTime: boolean;
}

const DUE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Parse a floating due string. Offsets/`Z` are honoured if present (then shown in local time). */
export function parseDue(s: string | null | undefined): ParsedDue | null {
  if (!s) return null;
  const m = DUE_RE.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, tz] = m;
  if (tz) {
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : { date: dt, hasTime: hh !== undefined };
  }
  const date = new Date(Number(y), Number(mo) - 1, Number(d), hh ? Number(hh) : 0, mm ? Number(mm) : 0);
  if (Number.isNaN(date.getTime())) return null;
  return { date, hasTime: hh !== undefined };
}

/** `YYYY-MM-DD` from local fields. */
export const toDateKey = (d: Date): string => format(d, "yyyy-MM-dd");

/** Serialize a floating due: date only, or `YYYY-MM-DDTHH:MM` from local fields (no UTC shift). */
export function formatDue(d: Date, hasTime: boolean): string {
  return hasTime ? format(d, "yyyy-MM-dd'T'HH:mm") : format(d, "yyyy-MM-dd");
}

/** Keep the time part of an existing due while moving it to another day. */
export function moveDueToDay(due: string | null | undefined, day: Date): string {
  const p = parseDue(due);
  if (p?.hasTime) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), p.date.getHours(), p.date.getMinutes());
    return formatDue(d, true);
  }
  return toDateKey(day);
}

/** Overdue: the day is before today, or it has a time that has already passed. */
export function isOverdue(due: string | null | undefined, now: Date = new Date()): boolean {
  const p = parseDue(due);
  if (!p) return false;
  if (p.hasTime) return p.date.getTime() < now.getTime();
  return differenceInCalendarDays(p.date, now) < 0;
}

/** Day-level bucket: a timed task due earlier today stays in "today" (its chip turns red). */
export function dueBucket(due: string | null | undefined, now: Date = new Date()): DueBucket {
  const p = parseDue(due);
  if (!p) return "none";
  const diff = differenceInCalendarDays(p.date, now);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return "week";
  return "later";
}

/**
 * Where a task belongs in Today (R3) by its two dates: Overdue when either is before today,
 * Today when either is today. `due` and `deadline` stay distinct — the earlier one decides, so a
 * task planned for next week with a deadline today is in Today, and a deadline-only task is not
 * "no date". Returns `null` when neither date falls on or before today.
 */
export function todayBucket(
  due: string | null | undefined,
  deadline: string | null | undefined,
  now: Date = new Date(),
): "overdue" | "today" | null {
  const d = dueBucket(due, now);
  const l = dueBucket(deadline, now);
  if (d === "overdue" || l === "overdue") return "overdue";
  if (d === "today" || l === "today") return "today";
  return null;
}

/* ------------------------------------------------ locale-driven formats (R38) */

/** The week's first day (date-fns numbering): the owner's override, else the system locale. */
export const weekStartsOn = (): WeekStart => localePrefs().weekStart;

/** Start of the week that contains `d`, honouring the effective week start. */
export function startOfLocaleWeek(d: Date, weekStart: WeekStart = weekStartsOn()): Date {
  return startOfWeek(d, { weekStartsOn: weekStart });
}

/** Numeric day and month in the effective order (no year): "12/3" or "3/12". */
function dayMonth(d: Date, order: DateOrder = localePrefs().dateOrder): string {
  return order === "dmy" ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Clock time: "2:30 PM" in 12-hour mode, "14:30" in 24-hour mode. */
export function clockLabel(d: Date): string {
  if (localePrefs().hourCycle === "h24") return format(d, "HH:mm");
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/** Short numeric date, with the year once it is not this year: "12/3" / "3/12", "1/3/2027". */
export function shortDate(d: Date, now: Date = new Date()): string {
  const base = dayMonth(d);
  return isSameYear(d, now) ? base : `${base}/${d.getFullYear()}`;
}

/** Numeric date that always carries the year: "12/3/2026" or "3/12/2026". */
export function numericDate(d: Date): string {
  return `${dayMonth(d)}/${d.getFullYear()}`;
}

/** Month-name date in the effective order: "Dec 3" / "3 Dec"; the year when it is not this year. */
export function monthDay(d: Date, now: Date = new Date()): string {
  const md = localePrefs().dateOrder === "dmy" ? `${d.getDate()} ${format(d, "MMM")}` : `${format(d, "MMM")} ${d.getDate()}`;
  return isSameYear(d, now) ? md : `${md} ${d.getFullYear()}`;
}

/** Month-name date that always carries the year: "Dec 3, 2026" or "3 Dec 2026". */
export function monthDayYear(d: Date): string {
  return localePrefs().dateOrder === "dmy"
    ? `${d.getDate()} ${format(d, "MMM")} ${d.getFullYear()}`
    : `${format(d, "MMM")} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Weekday plus month-name date: "Thu Dec 3" / "Thu 3 Dec"; the year when it is not this year. */
export function weekdayMonthDay(d: Date, now: Date = new Date()): string {
  return `${format(d, "EEE")} ${monthDay(d, now)}`;
}

/** Spelled-out date: "Thursday, October 15" or "Thursday, 15 October". */
export function longDate(d: Date): string {
  return localePrefs().dateOrder === "dmy"
    ? `${format(d, "EEEE")}, ${d.getDate()} ${format(d, "MMMM")}`
    : `${format(d, "EEEE")}, ${format(d, "MMMM")} ${d.getDate()}`;
}

/** Date and clock for tooltips and footers: "12/3/2026, 2:30 PM" or "3/12/2026, 14:30". */
export function timestampLabel(d: Date): string {
  return `${numericDate(d)}, ${clockLabel(d)}`;
}

/** "Today", "Tomorrow", "Yesterday", "Fri" (within 6 days), "10/21", "1/3/2027". */
export function relativeDayLabel(d: Date, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(d, "EEE");
  return shortDate(d, now);
}

/** Full chip label for a due string, e.g. "Today 5:00 PM", "Fri", "10/21". */
export function dueLabel(due: string | null | undefined, now: Date = new Date()): string {
  const p = parseDue(due);
  if (!p) return "";
  const day = relativeDayLabel(p.date, now);
  return p.hasTime ? `${day} ${clockLabel(p.date)}` : day;
}

/** Tone for a due chip: only overdue (danger) and today (success) carry hue; tomorrow fg; week and later muted. */
export type DueTone = "overdue" | "today" | "tomorrow" | "week" | "later";

export function dueTone(due: string | null | undefined, now: Date = new Date()): DueTone | null {
  const p = parseDue(due);
  if (!p) return null;
  if (isOverdue(due, now)) return "overdue";
  const b = dueBucket(due, now);
  return b === "none" || b === "overdue" ? "later" : b;
}

/** Text colour class per tone (design.md § Colors: colour in the text, never a tinted fill). */
export function dueToneClass(tone: DueTone): string {
  switch (tone) {
    case "overdue":
      return "text-due-overdue";
    case "today":
      return "text-due-today";
    case "tomorrow":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

/** Long header for day groups: "Thu 10/15 · Today". */
export function dayHeader(d: Date, now: Date = new Date()): string {
  const base = `${format(d, "EEE")} ${shortDate(d, now)}`;
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return `${base} · Today`;
  if (diff === 1) return `${base} · Tomorrow`;
  return base;
}

/** The next `n` days starting today (local midnight). */
export function upcomingDays(n: number, now: Date = new Date()): Date[] {
  const start = startOfDay(now);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

/** Group items by due bucket, preserving input order within buckets; empty buckets omitted. */
export function groupByBucket<T>(items: T[], getDue: (t: T) => string | null | undefined, now: Date = new Date()) {
  const map = new Map<DueBucket, T[]>();
  for (const it of items) {
    const b = dueBucket(getDue(it), now);
    const list = map.get(b) ?? [];
    list.push(it);
    map.set(b, list);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, label: BUCKET_LABEL[b], items: map.get(b) ?? [] }));
}

/** Sort key for due strings (no-date last). */
export function dueSortKey(due: string | null | undefined): number {
  const p = parseDue(due);
  return p ? p.date.getTime() + (p.hasTime ? 0 : 86_399_000) : Number.POSITIVE_INFINITY;
}

/** Compact relative time for RFC 3339 timestamps: "just now", "5m", "3h", "2d", "10/3". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const s = Math.round((now.getTime() - t.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)}d ago`;
  return shortDate(t, now);
}
