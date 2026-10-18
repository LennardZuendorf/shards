import { describe, expect, it } from "vitest";
import { dueBucket, dueLabel, dueTone, dueToneClass, formatDue, groupByBucket, isOverdue, moveDueToDay, parseDue, relativeDayLabel } from "./dates";
import { describeRecur, firstOccurrence, nextOccurrence, parseRRule } from "./recur";

const NOW = new Date(2026, 9, 15, 10, 0); // Thu

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
    expect(relativeDayLabel(new Date(2026, 9, 15), NOW)).toBe("Today");
    expect(relativeDayLabel(new Date(2026, 9, 16), NOW)).toBe("Tomorrow");
    expect(relativeDayLabel(new Date(2026, 9, 14), NOW)).toBe("Yesterday");
    expect(relativeDayLabel(new Date(2026, 9, 18), NOW)).toBe("Sun");
    expect(relativeDayLabel(new Date(2026, 9, 21), NOW)).toBe("Wed");
    expect(relativeDayLabel(new Date(2026, 9, 22), NOW)).toBe("Oct 22");
    expect(relativeDayLabel(new Date(2027, 0, 3), NOW)).toBe("Jan 3 2027");
    expect(dueLabel("2026-10-15T17:00", NOW)).toBe("Today 17:00");
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
