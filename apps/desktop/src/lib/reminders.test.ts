/**
 * R40 — in-window reminders (desktop-app/30, parity row P25).
 *
 * A timed task whose due time arrives while the window is open raises exactly one notice; the
 * same occurrence never raises a second one. The scheduler is the delivered semantics; the React
 * mount in `app/Reminders.tsx` only hands its output to the toast surface.
 *
 * Every case drives a fake clock (`tick(tasks, now)`) — nothing sleeps, and the "already raised"
 * log is injected so the negative control can switch the dedupe off and watch case 1 go red.
 */
import { describe, expect, it } from "vitest";
import { createReminderScheduler, forgetfulLog, memoryLog, reminderNotice, type ReminderLog } from "./reminders";
import type { Task } from "./types";

/** The window opened at 09:00 on 2026-01-05 (local time; due strings are floating local). */
const OPENED = new Date(2026, 0, 5, 9, 0).getTime();
const at = (h: number, m: number) => new Date(2026, 0, 5, h, m);

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    type: "task",
    title: "Call bank",
    tags: [],
    owner: null,
    created: null,
    updated: null,
    status: "open",
    priority: null,
    claimed_by: null,
    project: "Home",
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

/**
 * Acceptance 1's assertion, extracted so acceptance 5 can run the same body with the dedupe
 * disabled and watch it fail: the test cannot pass for a scheduler that has no memory.
 */
function expectFiresOnce(log?: ReminderLog) {
  const s = createReminderScheduler({ startedAt: OPENED, log });
  const t = task({ due: "2026-01-05T09:05" });

  // Not yet due.
  expect(s.tick([t], at(9, 4))).toEqual([]);

  // The tick that crosses 09:05 raises exactly one notice carrying title and project.
  const raised = s.tick([t], at(9, 5));
  expect(raised).toHaveLength(1);
  expect(raised[0]).toMatchObject({ id: "t-1", title: "Call bank", project: "Home", due: "2026-01-05T09:05" });
  expect(raised[0].key).toBe("t-1@2026-01-05T09:05");

  // Every later tick stays quiet for the same occurrence.
  expect(s.tick([t], at(9, 6))).toEqual([]);
  expect(s.tick([t], at(10, 0))).toEqual([]);
}

describe("in-window reminders", () => {
  it("fires once: a due time that arrives raises one notice, a second tick repeats nothing", () => {
    expectFiresOnce();
  });

  it("negative control: with the already-fired set disabled, the fires-once assertion fails", () => {
    // Same body, one thing changed: the log forgets. If this still passed, the dedupe in the
    // case above would be untested — a green test that cannot go red is not evidence.
    expect(() => expectFiresOnce(forgetfulLog())).toThrow();
  });

  it("completing the task before or after its time raises nothing", () => {
    const s = createReminderScheduler({ startedAt: OPENED });
    const doneBefore = task({ id: "t-a", status: "done", due: "2026-01-05T09:05" });
    expect(s.tick([doneBefore], at(9, 5))).toEqual([]);

    // Completed after it fired: the notice already raised is not repeated either.
    const t = task({ id: "t-b", due: "2026-01-05T09:10" });
    expect(s.tick([t], at(9, 10))).toHaveLength(1);
    expect(s.tick([{ ...t, status: "done" }], at(9, 11))).toEqual([]);
    // A cancelled task never fires.
    expect(s.tick([task({ id: "t-c", status: "cancelled", due: "2026-01-05T09:12" })], at(9, 12))).toEqual([]);
  });

  it("dismissing a notice stops further notices for that occurrence", () => {
    const s = createReminderScheduler({ startedAt: OPENED });
    const t = task({ due: "2026-01-05T09:05" });
    // A notice can be dismissed before this scheduler instance has raised it (e.g. an earlier
    // mount did): the dismissal is recorded on its own, not inferred from the raise.
    s.dismiss("t-1@2026-01-05T09:05");
    expect(s.tick([t], at(9, 5))).toEqual([]);
  });

  it("untimed tasks never fire: a date without a time (or no due) produces nothing", () => {
    const s = createReminderScheduler({ startedAt: OPENED });
    const dated = task({ id: "t-date", due: "2026-01-05" });
    const undated = task({ id: "t-none", due: null });
    expect(s.tick([dated, undated], at(23, 59))).toEqual([]);
    expect(s.tick([task({ id: "t-bad", due: "someday" })], at(23, 59))).toEqual([]);
  });

  it("a reminder that came due while the window was closed is skipped on reopen, and later times still fire", () => {
    const due = "2026-01-05T09:30";
    const before = createReminderScheduler({ startedAt: OPENED });
    expect(before.tick([task({ due })], at(9, 10))).toEqual([]); // open, not yet due
    expect(before.tick([task({ due })], at(9, 25))).toEqual([]);
    // Window closed before 09:30 and reopened at 10:00: the missed time raises nothing (R40:
    // Today's Overdue group covers it).
    const reopened = createReminderScheduler({ startedAt: at(10, 0).getTime() });
    expect(reopened.tick([task({ due })], at(10, 1))).toEqual([]);
    // The reopened window still reminds about times that arrive after it opened.
    const later = task({ id: "t-later", due: "2026-01-05T10:05" });
    expect(reopened.tick([later], at(10, 5))).toHaveLength(1);
  });

  it("a late tick (the window was minimised or the machine slept) still raises the notice, once", () => {
    const s = createReminderScheduler({ startedAt: OPENED });
    const t = task({ due: "2026-01-05T09:05" });
    // The minute clock coalesced; the due time is in the past but after the window opened.
    expect(s.tick([t], at(9, 9))).toHaveLength(1);
    expect(s.tick([t], at(9, 10))).toEqual([]);
  });

  it("a floating due is local wall-clock time: it fires at 09:05 in the viewer's own zone", () => {
    // `parseDue` builds the Date from local fields. Run this file under TZ=Europe/Stockholm and
    // TZ=UTC and the same assertion holds — a UTC-shifted parse would fire at 10:05 there.
    const s = createReminderScheduler({ startedAt: OPENED });
    const t = task({ due: "2026-01-05T09:05" });
    expect(s.tick([t], at(9, 4))).toEqual([]);
    expect(s.tick([t], at(9, 5))).toHaveLength(1);
  });

  it("an offset-suffixed due is absolute: it fires at that instant, shown on the local clock", () => {
    const instant = at(9, 5);
    const due = `${instant.toISOString().slice(0, 16)}Z`; // the same instant, written with `Z`
    const s = createReminderScheduler({ startedAt: OPENED });
    expect(s.tick([task({ due })], new Date(instant.getTime() - 60_000))).toEqual([]);
    expect(s.tick([task({ due })], instant)).toHaveLength(1);
  });

  it("a rescheduled occurrence re-arms under a new key", () => {
    const s = createReminderScheduler({ startedAt: OPENED });
    const first = task({ due: "2026-01-05T09:05" });
    expect(s.tick([first], at(9, 5))).toHaveLength(1);
    // Moved to 09:20: a new occurrence, so it fires again at its new time.
    expect(s.tick([{ ...first, due: "2026-01-05T09:20" }], at(9, 20))).toHaveLength(1);
  });

  it("the notice carries the title, the project title and a way to open the task", () => {
    const [reminder] = createReminderScheduler({ startedAt: OPENED }).tick(
      [task({ due: "2026-01-05T09:05" })],
      at(9, 5),
    );
    const opened: string[] = [];
    const dismissed: string[] = [];
    const notice = reminderNotice(reminder, {
      open: (id) => opened.push(id),
      dismiss: (key) => dismissed.push(key),
      projectTitle: "Home",
    });
    expect(notice.title).toBe("Call bank");
    expect(notice.body).toBe("Home");
    notice.open();
    expect(opened).toEqual(["t-1"]);
    expect(dismissed).toEqual(["t-1@2026-01-05T09:05"]);
  });

  it("the notice shows the project title, never the raw project id, and drops an unknown one", () => {
    const [reminder] = createReminderScheduler({ startedAt: OPENED }).tick(
      [task({ due: "2026-01-05T09:05", project: "n-372J" })],
      at(9, 5),
    );
    const actions = { open: () => {}, dismiss: () => {} };
    expect(reminderNotice(reminder, { ...actions, projectTitle: "Home" }).body).toBe("Home");
    // No title resolved (archived/deleted project): no line at all — `n-372J` is not a name.
    expect(reminderNotice(reminder, actions).body).toBeUndefined();
  });

  it("memoryLog is the default dedupe: has/add round-trip", () => {
    const log = memoryLog();
    expect(log.has("k")).toBe(false);
    log.add("k");
    expect(log.has("k")).toBe(true);
    expect(forgetfulLog().has("k")).toBe(false);
  });
});
