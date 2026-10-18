import { describe, expect, it } from "vitest";
import { parseQuickAdd, segments } from "./parse";

// Thursday 2026-10-15, 10:00 local time.
const NOW = new Date(2026, 9, 15, 10, 0);
const p = (s: string) => parseQuickAdd(s, { now: NOW });

describe("parseQuickAdd — the full example", () => {
  const r = p("Review PR #shards /backend @urgent-review p1 tomorrow 5pm every weekday {friday} +claude-code");

  it("extracts every field", () => {
    expect(r.title).toBe("Review PR");
    expect(r.project).toBe("shards");
    expect(r.section).toBe("backend");
    expect(r.labels).toEqual(["urgent-review"]);
    expect(r.priority).toBe("urgent");
    expect(r.due).toBe("2026-10-16T17:00");
    expect(r.recur).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(r.recur_from).toBe("due");
    expect(r.deadline).toBe("2026-10-16");
    expect(r.owner).toBe("claude-code");
  });

  it("returns token spans in source order that slice back to their text", () => {
    const input = "Review PR #shards /backend @urgent-review p1 tomorrow 5pm every weekday {friday} +claude-code";
    expect(r.tokens.map((t) => t.kind)).toEqual(["project", "section", "label", "priority", "due", "recur", "deadline", "owner"]);
    for (const t of r.tokens) expect(input.slice(t.start, t.end)).toBe(t.text);
    expect(r.tokens.find((t) => t.kind === "recur")?.text).toBe("every weekday");
    expect(r.tokens.find((t) => t.kind === "deadline")?.text).toBe("{friday}");
  });
});

describe("plain titles", () => {
  it("leaves a plain title untouched", () => {
    const r = p("Buy milk");
    expect(r.title).toBe("Buy milk");
    expect(r.tokens).toEqual([]);
    expect(r.due).toBeNull();
    expect(r.priority).toBeNull();
  });

  it("keeps #123 (issue numbers) in the title", () => {
    const r = p("Fix bug #123");
    expect(r.title).toBe("Fix bug #123");
    expect(r.project).toBeNull();
  });

  it("keeps URLs and paths in the title", () => {
    const r = p("Read https://example.com/docs/page later");
    expect(r.section).toBeNull();
    expect(r.title).toContain("https://example.com/docs/page");
  });

  it("keeps emails in the title", () => {
    const r = p("Email bob@example.com");
    expect(r.labels).toEqual([]);
    expect(r.title).toBe("Email bob@example.com");
  });

  it("does not treat a bare month name as a date", () => {
    const r = p("Review March plan");
    expect(r.due).toBeNull();
    expect(r.title).toBe("Review March plan");
  });

  it("does not treat C++ or +1 as an assignee", () => {
    const r = p("Learn C++ +1");
    expect(r.owner).toBeNull();
    expect(r.title).toBe("Learn C++ +1");
  });

  it("collapses whitespace left by removed tokens", () => {
    expect(p("  Call   mom   p2  ").title).toBe("Call mom");
  });
});

describe("priority", () => {
  it.each([
    ["p1", "urgent"],
    ["p2", "high"],
    ["p3", "normal"],
    ["P4", "low"],
  ])("%s → %s", (tok, prio) => {
    expect(p(`Task ${tok}`).priority).toBe(prio);
  });

  it("ignores p5 and words like pp1", () => {
    const r = p("Task p5 pp1");
    expect(r.priority).toBeNull();
    expect(r.title).toBe("Task p5 pp1");
  });
});

describe("labels, project, section, owner", () => {
  it("collects several labels and dedupes", () => {
    const r = p("Ship it @release @qa @release");
    expect(r.labels).toEqual(["release", "qa"]);
    expect(r.title).toBe("Ship it");
  });

  it("takes the last project when two are given", () => {
    expect(p("x #alpha #beta").project).toBe("beta");
  });

  it("accepts unicode project names", () => {
    expect(p("Plan #Küche").project).toBe("Küche");
  });

  it("parses an assignee", () => {
    expect(p("Draft spec +lennard").owner).toBe("lennard");
  });
});

describe("dates", () => {
  it("today", () => expect(p("Pay rent today").due).toBe("2026-10-15"));
  it("tomorrow", () => expect(p("Pay rent tomorrow").due).toBe("2026-10-16"));
  it("weekday name → next occurrence", () => expect(p("Standup friday").due).toBe("2026-10-16"));
  it("next week", () => expect(p("Plan next week").due).toBe("2026-10-22"));
  it("month + day", () => expect(p("Dentist oct 21").due).toBe("2026-10-21"));
  it("past month/day rolls forward to next year", () => expect(p("Taxes jan 5").due).toBe("2027-01-05"));
  it("in N days", () => expect(p("Follow up in 2 days").due).toBe("2026-10-17"));
  it("time today when still ahead", () => expect(p("Call 5pm").due).toBe("2026-10-15T17:00"));
  it("time that already passed moves to tomorrow", () => expect(p("Gym at 8am").due).toBe("2026-10-16T08:00"));
  it("date + time", () => {
    const r = p("Demo tomorrow at 3pm");
    expect(r.due).toBe("2026-10-16T15:00");
    expect(r.title).toBe("Demo");
  });
});

describe("recurrence", () => {
  it("every day", () => {
    const r = p("Meditate every day");
    expect(r.recur).toBe("FREQ=DAILY");
    expect(r.recur_from).toBe("due");
    expect(r.due).toBe("2026-10-15");
    expect(r.title).toBe("Meditate");
  });

  it("every! → recur_from completion", () => {
    const r = p("Water plants every! 3 days");
    expect(r.recur).toBe("FREQ=DAILY;INTERVAL=3");
    expect(r.recur_from).toBe("completion");
  });

  it("every weekday seeds due with the next weekday", () => {
    expect(p("Inbox zero every weekday").due).toBe("2026-10-15");
  });

  it("every mon, wed", () => {
    const r = p("Gym every mon, wed");
    expect(r.recur).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(r.due).toBe("2026-10-19");
    expect(r.title).toBe("Gym");
  });

  it("every tuesday and friday (long names, 'and')", () => {
    expect(p("Sync every tuesday and friday").recur).toBe("FREQ=WEEKLY;BYDAY=TU,FR");
  });

  it("every 2 weeks", () => {
    const r = p("Payroll every 2 weeks");
    expect(r.recur).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(r.title).toBe("Payroll");
  });

  it("every other month", () => expect(p("Haircut every other month").recur).toBe("FREQ=MONTHLY;INTERVAL=2"));

  it("every month on the 1st", () => {
    const r = p("Invoice every month on the 1st");
    expect(r.recur).toBe("FREQ=MONTHLY;BYMONTHDAY=1");
    expect(r.due).toBe("2026-11-01");
    expect(r.title).toBe("Invoice");
  });

  it("every 15th", () => {
    const r = p("Rent every 15th");
    expect(r.recur).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    expect(r.due).toBe("2026-10-15");
  });

  it("every year", () => expect(p("Renew domain every year").recur).toBe("FREQ=YEARLY"));

  it("every weekend", () => expect(p("Long run every weekend").recur).toBe("FREQ=WEEKLY;BYDAY=SA,SU"));

  it("every day at 9am uses the time and the next free slot", () => {
    const r = p("Review metrics every day at 9am");
    expect(r.recur).toBe("FREQ=DAILY");
    expect(r.due).toBe("2026-10-16T09:00");
  });

  it("every mon at 9am → next Monday 09:00", () => {
    expect(p("Plan week every mon at 9am").due).toBe("2026-10-19T09:00");
  });

  it("explicit date wins over the recurrence seed", () => {
    const r = p("Report every week starting oct 30");
    expect(r.recur).toBe("FREQ=WEEKLY");
    expect(r.due).toBe("2026-10-30");
  });

  it("'every' without a recognised unit stays in the title", () => {
    const r = p("Read every chapter");
    expect(r.recur).toBeNull();
    expect(r.title).toBe("Read every chapter");
  });
});

describe("deadline", () => {
  it("{friday} sets deadline, not due", () => {
    const r = p("Submit form {friday}");
    expect(r.deadline).toBe("2026-10-16");
    expect(r.due).toBeNull();
    expect(r.title).toBe("Submit form");
  });

  it("{oct 30} with a separate due", () => {
    const r = p("Draft talk tomorrow {oct 30}");
    expect(r.due).toBe("2026-10-16");
    expect(r.deadline).toBe("2026-10-30");
  });

  it("unparseable braces stay in the title", () => {
    const r = p("Fix {weird} thing");
    expect(r.deadline).toBeNull();
    expect(r.title).toBe("Fix {weird} thing");
  });
});

describe("segments", () => {
  it("splits input into plain and token parts that rejoin to the input", () => {
    const input = "Write docs #shards p2 tomorrow";
    const r = parseQuickAdd(input, { now: NOW });
    const segs = segments(input, r.tokens);
    expect(segs.map((s) => s.text).join("")).toBe(input);
    expect(segs.filter((s) => s.token).map((s) => s.token?.kind)).toEqual(["project", "priority", "due"]);
  });
});

describe("multi-word names", () => {
  const known = {
    project: ["Shards", "Shards Launch", "Q4 Planning", "Flights Agent"],
    section: ["Build", "Next Steps"],
    label: ["review", "needs input"],
    owner: ["Claude Code", "lennard"],
  };
  const pk = (s: string) => parseQuickAdd(s, { now: NOW, known });

  it("takes a known multi-word project whole (the review repro)", () => {
    const input = "Review agent PR tomorrow 3pm #Shards Launch /Build @review p1 every friday {next monday}";
    const r = pk(input);
    expect(r.title).toBe("Review agent PR");
    expect(r.project).toBe("Shards Launch");
    expect(r.section).toBe("Build");
    expect(r.labels).toEqual(["review"]);
    expect(r.priority).toBe("urgent");
    expect(r.recur).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(r.deadline).toBe("2026-10-19");
    expect(r.due).toBe("2026-10-16T15:00");
    for (const t of r.tokens) expect(input.slice(t.start, t.end)).toBe(t.text);
    expect(r.tokens.find((t) => t.kind === "project")?.text).toBe("#Shards Launch");
  });

  it("matches known names case-insensitively and returns the known spelling", () => {
    const r = pk("Plan budget #q4 planning");
    expect(r.project).toBe("Q4 Planning");
    expect(r.title).toBe("Plan budget");
  });

  it("prefers the longest known name", () => {
    expect(pk("Ship it #Shards Launch").project).toBe("Shards Launch");
    expect(pk("Ship it #Shards first").project).toBe("Shards");
    expect(pk("Ship it #Shards first").title).toBe("Ship it first");
  });

  it("needs a token boundary after a known name", () => {
    const r = pk("Ship it #Shards Launchpad");
    expect(r.project).toBe("Shards");
    expect(r.title).toBe("Ship it Launchpad");
  });

  it("accepts a quoted name for unknown multi-word projects", () => {
    const r = pk('Draft memo #"Board Prep" tomorrow');
    expect(r.project).toBe("Board Prep");
    expect(r.title).toBe("Draft memo");
    expect(r.due).toBe("2026-10-16");
  });

  it("canonicalises a quoted known name", () => {
    expect(pk('Draft memo #"flights agent"').project).toBe("Flights Agent");
  });

  it("handles multi-word sections, labels and assignees", () => {
    const r = pk("Fix flaky test /Next Steps @needs input +Claude Code");
    expect(r.title).toBe("Fix flaky test");
    expect(r.section).toBe("Next Steps");
    expect(r.labels).toEqual(["needs input"]);
    expect(r.owner).toBe("Claude Code");
  });

  it("still keeps #123 and emails in the title with known names", () => {
    const r = pk("Fix bug #123 for bob@example.com");
    expect(r.project).toBeNull();
    expect(r.title).toBe("Fix bug #123 for bob@example.com");
  });
});

describe("unsupported repeat phrases", () => {
  const today = "2026-10-15";

  it.each([
    ["Ship docs every last day", "every last day"],
    ["Ship docs every last day of month", "every last day of month"],
    ["Payroll every last workday", "every last workday"],
    ["Standup every first monday", "every first monday"],
  ])("%s keeps the phrase in the title, sets no rule and no past date", (input, phrase) => {
    const r = p(input);
    expect(r.recur).toBeNull();
    expect(r.due).toBeNull();
    expect(r.title).toBe(input);
    expect(r.title.endsWith(" every")).toBe(false);
    expect(r.warning).toBe(`Repeat not understood: “${phrase}”`);
  });

  it("still parses a date and sigils outside the phrase", () => {
    const r = p("Ship docs every last day #shards tomorrow p2");
    expect(r.title).toBe("Ship docs every last day");
    expect(r.project).toBe("shards");
    expect(r.priority).toBe("high");
    expect(r.due).toBe("2026-10-16");
    expect(r.due! >= today).toBe(true);
  });

  it("does not warn when every is an ordinary word", () => {
    const r = p("Check every invoice tomorrow");
    expect(r.warning).toBeNull();
    expect(r.title).toBe("Check every invoice");
    expect(r.due).toBe("2026-10-16");
  });

  it("does not warn for a supported rule", () => {
    expect(p("Standup every weekday").warning).toBeNull();
  });
});

describe("day of the month", () => {
  it("on the 20th is the next 20th", () => {
    const r = p("Pay rent on the 20th");
    expect(r.due).toBe("2026-10-20");
    expect(r.title).toBe("Pay rent");
  });

  it("a day already past rolls to next month", () => {
    expect(p("Pay rent on the 3rd").due).toBe("2026-11-03");
  });

  it("today counts", () => {
    expect(p("Pay rent on 15th").due).toBe("2026-10-15");
  });

  it("skips months without the day", () => {
    expect(p("Close books on the 31st").due).toBe("2026-10-31");
    expect(parseQuickAdd("Close books on the 31st", { now: new Date(2026, 10, 2) }).due).toBe("2026-12-31");
  });

  it("leaves a bare ordinal in the title", () => {
    const r = p("Celebrate the 20th anniversary");
    expect(r.due).toBeNull();
    expect(r.title).toBe("Celebrate the 20th anniversary");
  });
});
