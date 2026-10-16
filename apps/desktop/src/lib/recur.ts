/**
 * RRULE subset used by task-model-v2: FREQ ∈ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL,
 * BYDAY (weekly only), BYMONTHDAY (monthly only). Pure, locale-independent.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export const WEEKDAYS: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_SHORT: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
/** JS getDay() (0 = Sunday) → RRULE weekday. */
const JS_DAY: readonly Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export interface RRule {
  freq: Freq;
  interval: number;
  byday?: Weekday[];
  bymonthday?: number;
}

export function parseRRule(s: string | null | undefined): RRule | null {
  if (!s) return null;
  const parts = new Map<string, string>();
  for (const seg of s.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  const freq = parts.get("FREQ") as Freq | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const interval = Math.max(1, Number.parseInt(parts.get("INTERVAL") ?? "1", 10) || 1);
  const rule: RRule = { freq, interval };
  const byday = parts.get("BYDAY");
  if (byday) {
    const days = byday.split(",").filter((d): d is Weekday => (WEEKDAYS as string[]).includes(d));
    if (days.length) rule.byday = sortWeekdays(days);
  }
  const bmd = parts.get("BYMONTHDAY");
  if (bmd) {
    const n = Number.parseInt(bmd, 10);
    if (n >= 1 && n <= 31) rule.bymonthday = n;
  }
  return rule;
}

export function sortWeekdays(days: Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}

export function formatRRule(r: RRule): string {
  const out = [`FREQ=${r.freq}`];
  if (r.interval > 1) out.push(`INTERVAL=${r.interval}`);
  if (r.freq === "WEEKLY" && r.byday?.length) out.push(`BYDAY=${sortWeekdays(r.byday).join(",")}`);
  if (r.freq === "MONTHLY" && r.bymonthday) out.push(`BYMONTHDAY=${r.bymonthday}`);
  return out.join(";");
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

const UNIT: Record<Freq, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };

/** Human label: "Every weekday", "Every Mon, Wed", "Every 2 weeks", "Every month on the 1st". */
export function describeRecur(s: string | null | undefined, from?: "due" | "completion" | null): string {
  const r = parseRRule(s);
  if (!r) return s ? `Repeats (${s})` : "";
  let base: string;
  const unit = UNIT[r.freq];
  const every = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`;
  if (r.freq === "WEEKLY" && r.byday?.length) {
    const key = r.byday.join(",");
    const days =
      key === "MO,TU,WE,TH,FR" ? "weekday" : key === "SA,SU" ? "weekend day" : r.byday.map((d) => WEEKDAY_SHORT[d]).join(", ");
    base = r.interval > 1 ? `${every} on ${days}` : `Every ${days}`;
  } else if (r.freq === "MONTHLY" && r.bymonthday) {
    base = `${every} on the ${ordinal(r.bymonthday)}`;
  } else if (r.freq === "DAILY" && r.interval === 1) {
    base = "Every day";
  } else {
    base = every;
  }
  return from === "completion" ? `${base} after completion` : base;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  x.setDate(x.getDate() + n);
  return x;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/**
 * First occurrence on or after `from` (date part only; time is preserved from `from`).
 * Used to seed `due` when quick-add has a recurrence but no explicit date.
 */
export function firstOccurrence(rule: RRule, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes());
  if (rule.freq === "WEEKLY" && rule.byday?.length) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (rule.byday.includes(JS_DAY[d.getDay()])) return d;
    }
  }
  if (rule.freq === "MONTHLY" && rule.bymonthday) {
    let y = start.getFullYear();
    let m = start.getMonth();
    for (let i = 0; i < 24; i++) {
      const day = Math.min(rule.bymonthday, daysInMonth(y, m));
      const d = new Date(y, m, day, start.getHours(), start.getMinutes());
      if (d >= new Date(start.getFullYear(), start.getMonth(), start.getDate())) return d;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return start;
}

/** The next occurrence strictly after `after`'s day, stepping from `anchor` (preview only). */
export function nextOccurrence(rule: RRule, anchor: Date): Date {
  switch (rule.freq) {
    case "DAILY":
      return addDays(anchor, rule.interval);
    case "WEEKLY": {
      if (rule.byday?.length) {
        for (let i = 1; i <= 7 * rule.interval; i++) {
          const d = addDays(anchor, i);
          const weeksApart = Math.floor((i + ((anchor.getDay() + 6) % 7)) / 7);
          if (rule.byday.includes(JS_DAY[d.getDay()]) && (weeksApart === 0 || weeksApart % rule.interval === 0)) return d;
        }
      }
      return addDays(anchor, 7 * rule.interval);
    }
    case "MONTHLY": {
      const y = anchor.getFullYear();
      const m = anchor.getMonth() + rule.interval;
      const want = rule.bymonthday ?? anchor.getDate();
      const ny = y + Math.floor(m / 12);
      const nm = m % 12;
      return new Date(ny, nm, Math.min(want, daysInMonth(ny, nm)), anchor.getHours(), anchor.getMinutes());
    }
    case "YEARLY": {
      const ny = anchor.getFullYear() + rule.interval;
      return new Date(ny, anchor.getMonth(), Math.min(anchor.getDate(), daysInMonth(ny, anchor.getMonth())), anchor.getHours(), anchor.getMinutes());
    }
  }
}
