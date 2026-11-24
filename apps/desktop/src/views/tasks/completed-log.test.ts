/**
 * R34 — the Completed log's pure core (desktop-app/25). The rendered view is exercised end to end
 * against a real host in `e2e/host-workflow.mjs`; these cases pin the window, the order, the
 * recurring "latest occurrence only" rule and the archived/duplicate data edges that would
 * otherwise only show up in a vault.
 */
import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { toDateKey } from "@/lib/dates";
import type { Task } from "@/lib/types";
import {
  COMPLETED_LOG_DAYS,
  completedDayGroups,
  completedDayLabel,
  completedLog,
  completedWindowStart,
} from "@/components/task/model";

/** A fixed local afternoon: every stamp below is built from local calendar fields, so the day
 * grouping cannot shift with the machine's time zone. */
const NOW = new Date(2026, 10, 24, 14, 30);

/** An instant `daysAgo` local days back at `hour` local, on the wire as `…Z`. */
const at = (daysAgo: number, hour = 9): string =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour).toISOString();

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: "lennard",
    created: "2026-01-01T09:00:00Z",
    updated: "2026-01-01T09:00:00Z",
    status: "done",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

const ids = (entries: { task: Task }[]) => entries.map((e) => e.task.id);

describe("completedLog — the 30-day window", () => {
  it("lists exactly the tasks inside the window, newest first, and drops the 31-day-old one", () => {
    const done = [
      task("t-A", { completed: at(3), project: "n-HOME" }),
      task("t-B", { completed: at(10), project: "n-LAUNCH" }),
      task("t-C", { completed: at(29), project: "n-HOME" }),
      task("t-OLD", { completed: at(31), project: "n-HOME" }),
    ];
    expect(ids(completedLog(done, [], NOW))).toEqual(["t-A", "t-B", "t-C"]);
  });

  it("keeps day 30 and drops day 31 at the local day boundary, not 720 hours", () => {
    // One minute after midnight on day 30 is inside; a late evening on day 31 is outside.
    const day30 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30, 0, 1).toISOString();
    const day31 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 31, 23, 59).toISOString();
    const entries = completedLog([task("t-30", { completed: day30 }), task("t-31", { completed: day31 })], [], NOW);
    expect(ids(entries)).toEqual(["t-30"]);
    // The cutoff really is local midnight of day 30.
    expect(completedWindowStart(NOW)).toEqual(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30));
    expect(COMPLETED_LOG_DAYS).toBe(30);
  });

  it("negative control: with the window disabled the 31-day-old task is listed, so (1) can go red", () => {
    const done = [
      task("t-A", { completed: at(3) }),
      task("t-B", { completed: at(10) }),
      task("t-C", { completed: at(29) }),
      task("t-OLD", { completed: at(31) }),
    ];
    expect(ids(completedLog(done, [], NOW, 400))).toEqual(["t-A", "t-B", "t-C", "t-OLD"]);
  });
});

describe("completedLog — one row per task", () => {
  it("shows a recurring task once, at its latest completion, from the open set", () => {
    // The core reopens a recurring finish: status stays `open`, `completed` is re-stamped and the
    // due date advances, so the file only ever holds the latest occurrence.
    const water = task("t-WATER", {
      status: "open",
      recur: "FREQ=DAILY",
      due: "2026-11-25",
      completed: at(0, 8),
    });
    const entries = completedLog([], [water], NOW);
    expect(ids(entries)).toEqual(["t-WATER"]);
    expect(entries[0].task.completed).toBe(at(0, 8));
    // Still open: the log must offer no Reopen for it (the view keys that off `status`).
    expect(entries[0].task.status).toBe("open");
    expect(entries[0].task.recur).toBe("FREQ=DAILY");
  });

  it("collapses duplicate ids to the later completion", () => {
    const entries = completedLog(
      [task("t-DUP", { completed: at(5) }), task("t-DUP", { completed: at(2) })],
      [],
      NOW,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].task.completed).toBe(at(2));
  });

  it("keeps the newest stamp when a task is in both the done and the active listing", () => {
    const entries = completedLog([task("t-R", { completed: at(4) })], [task("t-R", { status: "open", completed: at(1) })], NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0].task.completed).toBe(at(1));
  });

  it("never lists a cancelled task, whatever its stamp, and drops an unparseable one", () => {
    const entries = completedLog(
      [task("t-X", { status: "cancelled", completed: at(1) }), task("t-BAD", { completed: "not-a-date" })],
      [],
      NOW,
    );
    expect(entries).toEqual([]);
  });
});

describe("completedDayGroups — local day groups", () => {
  it("labels today and yesterday, groups by day, and keeps newest day first", () => {
    const entries = completedLog(
      [
        task("t-1", { completed: at(0, 9) }),
        task("t-2", { completed: at(0, 15) }),
        task("t-3", { completed: at(1, 11) }),
        task("t-4", { completed: at(9) }),
      ],
      [],
      NOW,
    );
    const groups = completedDayGroups(entries, NOW);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      format(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 9), "EEE d MMM"),
    ]);
    expect(groups.map((g) => g.tasks.map((t) => t.id))).toEqual([["t-2", "t-1"], ["t-3"], ["t-4"]]);
  });

  it("says the date when the day is older than yesterday", () => {
    const five = format(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 5), "EEE d MMM");
    const day = toDateKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 5));
    expect(completedDayLabel(day, NOW)).toBe(five);
  });
});
