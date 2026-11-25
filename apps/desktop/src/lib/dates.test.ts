import { describe, expect, it, beforeEach } from "vitest";
import {
  clockLabel,
  dayHeader,
  dueBucket,
  dueLabel,
  dueTone,
  dueToneClass,
  formatDue,
  groupByBucket,
  isOverdue,
  monthDay,
  moveDueToDay,
  numericDate,
  parseDue,
  relativeDayLabel,
  shortDate,
  startOfLocaleWeek,
  timestampLabel,
  toDateKey,
  weekdayMonthDay,
} from "./dates";
import { resetLocalePrefs, setDateOrder, setHourCycle, setWeekStart } from "./locale";
import { describeRecur, firstOccurrence, nextOccurrence, parseRRule } from "./recur";

const NOW = new Date(2026, 9, 15, 10, 0); // Thu

beforeEach(() => {
  resetLocalePrefs();
});

describe("dates", () => {
  it("parses floating date and datetime without UTC shift", () => {
    expect(parseDue("2026-10-16")?.date.getDate()).toBe(16);
    const p = parseDue("2026-10-16T17:30");
    expect(p?.hasTime).toBe(true);
    expect(p?.date.getHours()).toBe(17);
    expect(parseDue("nope")).toBeNull();
  });

  it("formats from local fields", () => {
    expect(formatDue(new Date(2026, 0, 2, 3, 4), true)).toBe("2026-01-02T03:04");
    expect(formatDue(new Date(2026, 0, 2, 3, 4), false)).toBe("2026-01-02");
  });

  it("buckets", () => {
    expect(dueBucket("2026-10-14", NOW)).toBe("overdue");
    expect(dueBucket("2026-10-15", NOW)).toBe("today");
    expect(dueBucket("2026-10-16", NOW)).toBe("tomorrow");
    expect(dueBucket("2026-10-20", NOW)).toBe("week");
    expect(dueBucket("2026-10-22", NOW)).toBe("later");
    expect(dueBucket(null, NOW)).toBe("none");
  });

  it("overdue honours time of day", () => {
    expect(isOverdue("2026-10-15T09:00", NOW)).toBe(true);
    expect(isOverdue("2026-10-15T11:00", NOW)).toBe(false);
    expect(isOverdue("2026-10-15", NOW)).toBe(false);
    expect(dueTone("2026-10-15T09:00", NOW)).toBe("overdue");
  });

  it("labels", () => {
    setHourCycle("h12");
    setDateOrder("mdy");
    expect(relativeDayLabel(new Date(2026, 9, 15), NOW)).toBe("Today");
    expect(relativeDayLabel(new Date(2026, 9, 16), NOW)).toBe("Tomorrow");
    expect(relativeDayLabel(new Date(2026, 9, 14), NOW)).toBe("Yesterday");
    expect(relativeDayLabel(new Date(2026, 9, 18), NOW)).toBe("Sun");
    expect(relativeDayLabel(new Date(2026, 9, 21), NOW)).toBe("Wed");
    expect(relativeDayLabel(new Date(2026, 9, 22), NOW)).toBe("10/22");
    expect(relativeDayLabel(new Date(2027, 0, 3), NOW)).toBe("1/3/2027");
    expect(dueLabel("2026-10-15T17:00", NOW)).toBe("Today 5:00 PM");
  });

  it("moves a due to another day keeping its time", () => {
    expect(moveDueToDay("2026-10-15T17:00", new Date(2026, 9, 20))).toBe("2026-10-20T17:00");
    expect(moveDueToDay(null, new Date(2026, 9, 20))).toBe("2026-10-20");
  });

  it("groups by bucket in fixed order", () => {
    const g = groupByBucket(["2026-10-16", null, "2026-10-10", "2026-10-15"], (x) => x, NOW);
    expect(g.map((x) => x.bucket)).toEqual(["overdue", "today", "tomorrow", "none"]);
  });
});

describe("recur", () => {
  it("describes rules", () => {
    expect(describeRecur("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
    expect(describeRecur("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("Every Mon, Wed");
    expect(describeRecur("FREQ=WEEKLY;INTERVAL=2")).toBe("Every 2 weeks");
    expect(describeRecur("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("Every month on the 1st");
    expect(describeRecur("FREQ=DAILY", "completion")).toBe("Every day after completion");
    expect(describeRecur("FREQ=YEARLY")).toBe("Every year");
  });

  it("first and next occurrences", () => {
    const r = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE");
    if (!r) throw new Error("rule");
    expect(firstOccurrence(r, NOW).getDate()).toBe(19);
    expect(nextOccurrence(r, new Date(2026, 9, 19)).getDate()).toBe(21);
    const m = parseRRule("FREQ=MONTHLY;BYMONTHDAY=31");
    if (!m) throw new Error("rule");
    expect(nextOccurrence(m, new Date(2026, 9, 31)).getDate()).toBe(30); // Nov has 30 days
  });
});

describe("dueToneClass", () => {
  it("only overdue and today carry hue; tomorrow is fg, week and later are muted", () => {
    expect(dueToneClass("overdue")).toBe("text-due-overdue");
    expect(dueToneClass("today")).toBe("text-due-today");
    expect(dueToneClass("tomorrow")).toBe("text-foreground");
    expect(dueToneClass("week")).toBe("text-muted-foreground");
    expect(dueToneClass("later")).toBe("text-muted-foreground");
  });
});

/**
 * R38 — week start, clock and date order, each with an override that beats the system default.
 * These are the card's acceptance cases: a Sunday/Monday week start, 14:30 in both clock modes
 * and 2026-12-03 in both date orders, every one of them through the single helper.
 */
describe("locale preferences (R38)", () => {
  it("starts the week on Sunday or Monday as the setting says", () => {
    const thu = new Date(2026, 9, 15);
    setWeekStart(0);
    expect(toDateKey(startOfLocaleWeek(thu))).toBe("2026-10-11");
    setWeekStart(1);
    expect(toDateKey(startOfLocaleWeek(thu))).toBe("2026-10-12");
  });

  it("renders 14:30 as 2:30 PM in 12-hour mode and 14:30 in 24-hour mode", () => {
    const at = new Date(2026, 9, 15, 14, 30);
    setHourCycle("h12");
    expect(clockLabel(at)).toBe("2:30 PM");
    expect(dueLabel("2026-10-15T14:30", NOW)).toBe("Today 2:30 PM");
    setHourCycle("h24");
    expect(clockLabel(at)).toBe("14:30");
    expect(dueLabel("2026-10-15T14:30", NOW)).toBe("Today 14:30");
    expect(clockLabel(new Date(2026, 9, 15, 0, 5))).toBe("00:05");
    expect(clockLabel(new Date(2026, 9, 15, 12, 0))).toBe("12:00");
  });

  it("renders 2026-12-03 as 12/3 month-first and 3/12 day-first", () => {
    const dec3 = new Date(2026, 11, 3);
    setHourCycle("h12");
    setDateOrder("mdy");
    expect(shortDate(dec3, NOW)).toBe("12/3");
    expect(dueLabel("2026-12-03", NOW)).toBe("12/3");
    expect(dayHeader(dec3)).toBe("Thu 12/3");
    expect(numericDate(dec3)).toBe("12/3/2026");
    expect(timestampLabel(new Date(2026, 11, 3, 14, 30))).toBe("12/3/2026, 2:30 PM");
    expect(weekdayMonthDay(dec3)).toBe("Thu Dec 3");
    expect(monthDay(dec3)).toBe("Dec 3");

    setDateOrder("dmy");
    expect(shortDate(dec3, NOW)).toBe("3/12");
    expect(dueLabel("2026-12-03", NOW)).toBe("3/12");
    expect(dayHeader(dec3)).toBe("Thu 3/12");
    expect(numericDate(dec3)).toBe("3/12/2026");
    expect(timestampLabel(new Date(2026, 11, 3, 14, 30))).toBe("3/12/2026, 2:30 PM");
    expect(weekdayMonthDay(dec3)).toBe("Thu 3 Dec");
    expect(monthDay(dec3)).toBe("3 Dec");
  });
});
