import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_OPTIONS, type ViewOptions } from "./ui-contract";
import type { Task } from "./types";
import { dueBucket } from "./dates";
import { applyViewOptions, dropPatch, filterChips, filterTasks, filtersActive, groupTasks, parseViewOptions, sortTasks } from "./view-options";
import { compareByDue, compareManual } from "@/components/task/model";
import type { TaskGroupSpec } from "@/components/task/TaskList";

/** A valid task fixture; tests override one field at a time. */
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: null,
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-01T00:00:00Z",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

/** Thu 15 Oct 2026, 10:00 local. */
const NOW = new Date(2026, 9, 15, 10, 0);
const ids = (ts: readonly Task[]) => ts.map((t) => t.id);
const opts = (over: Partial<ViewOptions>): ViewOptions => ({ ...DEFAULT_VIEW_OPTIONS, ...over });

describe("parseViewOptions", () => {
  it("falls back to the defaults for anything that is not an options object", () => {
    for (const raw of [null, undefined, "x", 3, [], true]) expect(parseViewOptions(raw, "inbox")).toEqual(DEFAULT_VIEW_OPTIONS);
  });

  it("keeps valid fields and replaces invalid ones one by one", () => {
    const got = parseViewOptions({ group: "priority", sort: "bogus", dir: "desc", density: "huge", filters: 4 }, "today");
    expect(got).toEqual({ ...DEFAULT_VIEW_OPTIONS, group: "priority", dir: "desc" });
  });

  it("allows section grouping only in project views", () => {
    expect(parseViewOptions({ group: "section" }, "inbox").group).toBe("default");
    expect(parseViewOptions({ group: "section" }, "project:n-1").group).toBe("section");
  });

  it("keeps only known filter values", () => {
    const got = parseViewOptions({ filters: { priority: ["high", "nope", 3], due: ["today", "soon"], labels: ["a", 1], assignees: [""], hasDeadline: "yes", blocked: true } }, "today");
    expect(got.filters).toEqual({ priority: ["high"], due: ["today"], labels: ["a"], assignees: [""], blocked: true });
  });
});

describe("sortTasks", () => {
  const a = task("a", { due: "2026-10-20", order: 3 });
  const b = task("b", { due: "2026-10-18", order: 2 });
  const c = task("c", { due: null, order: 1 });
  const d = task("d", { due: "2026-10-18", order: 4 });

  it("sorts by due with no-date last, ties in manual order then id", () => {
    expect(ids(sortTasks([a, b, c, d], "due", "asc"))).toEqual(["b", "d", "a", "c"]);
  });

  it("reverses only the primary key when descending; ties and missing values stay put", () => {
    expect(ids(sortTasks([a, b, c, d], "due", "desc"))).toEqual(["a", "b", "d", "c"]);
  });

  it("sorts by priority, title, created and updated", () => {
    const hi = task("hi", { priority: "high", title: "b", created: "2026-10-02T00:00:00Z", updated: "2026-10-05T00:00:00Z" });
    const lo = task("lo", { priority: "low", title: "A", created: "2026-10-03T00:00:00Z", updated: "2026-10-04T00:00:00Z" });
    const ur = task("ur", { priority: "urgent", title: "c", created: "2026-10-01T00:00:00Z", updated: "2026-10-06T00:00:00Z" });
    const all = [hi, lo, ur];
    expect(ids(sortTasks(all, "priority", "asc"))).toEqual(["ur", "hi", "lo"]);
    expect(ids(sortTasks(all, "title", "asc"))).toEqual(["lo", "hi", "ur"]);
    expect(ids(sortTasks(all, "created", "asc"))).toEqual(["ur", "hi", "lo"]);
    expect(ids(sortTasks(all, "updated", "desc"))).toEqual(["ur", "hi", "lo"]);
  });

  it("manual is the delivered manual order", () => {
    expect(ids(sortTasks([a, b, c, d], "manual", "asc"))).toEqual(ids([a, b, c, d].sort(compareManual)));
  });
});

describe("groupTasks", () => {
  it("groups by due bucket in bucket order", () => {
    const got = groupTasks([task("o", { due: "2026-10-10" }), task("t", { due: "2026-10-15" }), task("n")], "due", { now: NOW });
    const withTasks = got.filter((g) => g.tasks.length).map((g) => [g.key, ids(g.tasks)]);
    expect(withTasks).toEqual([
      ["overdue", ["o"]],
      ["today", ["t"]],
      ["none", ["n"]],
    ]);
    expect(dueBucket("2026-10-10", NOW)).toBe("overdue");
  });

  it("groups by priority with every priority present as a drop target", () => {
    const got = groupTasks([task("a", { priority: "high" })], "priority", { now: NOW });
    expect(got.map((g) => g.key)).toEqual(["urgent", "high", "normal", "low"]);
    expect(ids(got[1].tasks)).toEqual(["a"]);
  });

  it("groups by project with the Inbox first, then sidebar order", () => {
    const projects = [
      { id: "p2", title: "Two" },
      { id: "p1", title: "One" },
    ];
    const got = groupTasks([task("a", { project: "p1" }), task("b", { project: "p2" }), task("c")], "project", { projects });
    expect(got.map((g) => [g.title, ids(g.tasks)])).toEqual([
      ["Inbox", ["c"]],
      ["Two", ["b"]],
      ["One", ["a"]],
    ]);
  });

  it("puts a task with several labels in each label group, unlabelled last", () => {
    const got = groupTasks([task("a", { tags: ["x", "y"] }), task("b", { tags: ["y"] }), task("c")], "label", {});
    expect(got.map((g) => [g.key, ids(g.tasks)])).toEqual([
      ["x", ["a"]],
      ["y", ["a", "b"]],
      ["", ["c"]],
    ]);
  });

  it("groups by assignee by name, unassigned last", () => {
    const got = groupTasks([task("a", { owner: "bob" }), task("b", { owner: "ann" }), task("c")], "assignee", { memberName: (id) => id.toUpperCase() });
    expect(got.map((g) => [g.title, ids(g.tasks)])).toEqual([
      ["ANN", ["b"]],
      ["BOB", ["a"]],
      ["Unassigned", ["c"]],
    ]);
  });

  it("groups by section: no section first, then known sections", () => {
    const got = groupTasks([task("a", { section: "Next" }), task("b")], "section", { sections: ["Next", "Later"] });
    expect(got.map((g) => [g.key, ids(g.tasks)])).toEqual([
      ["", ["b"]],
      ["Next", ["a"]],
      ["Later", []],
    ]);
  });
});

describe("dropPatch", () => {
  it("maps a group key to the field it stands for", () => {
    expect(dropPatch("priority", "high")).toEqual({ priority: "high" });
    expect(dropPatch("project", "p1")).toEqual({ project: "p1", section: null });
    expect(dropPatch("section", "Next")).toEqual({ section: "Next" });
    expect(dropPatch("section", "")).toEqual({ section: null });
    expect(dropPatch("assignee", "ann")).toEqual({ owner: "ann" });
    expect(dropPatch("due", "none")).toEqual({ due: null });
  });

  it("refuses what it cannot write", () => {
    expect(dropPatch("label", "x")).toBeNull();
    expect(dropPatch("priority", "bogus")).toBeNull();
    expect(dropPatch("assignee", "")).toBeNull();
    expect(dropPatch("due", "overdue")).toBeNull();
    expect(dropPatch("due", "later")).toBeNull();
    expect(dropPatch("none", "all")).toBeNull();
  });

  it("dates a due-bucket drop: today, tomorrow, next Monday, none; keeps the time of day", () => {
    const due = (key: string, t?: Task) => (dropPatch("due", key, { now: NOW, task: t }) as { due: string }).due;
    expect(due("today")).toBe("2026-10-15");
    expect(due("tomorrow")).toBe("2026-10-16");
    expect(due("week")).toBe("2026-10-19");
    expect(due("today", task("t", { due: "2026-10-20T09:30" }))).toBe("2026-10-15T09:30");
  });

  it("lands every due drop in the bucket it was dropped on, on every weekday", () => {
    for (let day = 0; day < 14; day++) {
      const now = new Date(2026, 9, 11 + day, 10, 0);
      for (const key of ["today", "tomorrow", "week"]) {
        const patch = dropPatch("due", key, { now }) as { due: string };
        expect(dueBucket(patch.due, now), `${now.toDateString()} → ${key}`).toBe(key);
      }
    }
  });
});

describe("applyViewOptions", () => {
  const defaults: TaskGroupSpec[] = [
    { key: "overdue", title: "Overdue", tasks: [task("o", { due: "2026-10-10" })], compare: compareByDue, dropArgs: () => null },
    { key: "today", tasks: [task("t1", { due: "2026-10-15", priority: "high" }), task("t2", { due: "2026-10-15" })], compare: compareByDue },
    { key: "others", title: "Agents", tasks: [task("x", { owner: "claude" })], compare: compareByDue, fixed: true },
  ];

  it("returns the delivered groups untouched for the default options", () => {
    expect(applyViewOptions(defaults, DEFAULT_VIEW_OPTIONS, { now: NOW })).toBe(defaults);
  });

  it("keeps the delivered groups but sorts within them, with reorder off", () => {
    const got = applyViewOptions(
      [{ key: "s:", tasks: [task("a", { order: 1, title: "b" }), task("b", { order: 2, title: "a" })], reorder: true, compare: compareManual }],
      opts({ sort: "title" }),
      {},
    );
    expect(got[0].reorder).toBe(false);
    expect(ids([...got[0].tasks].sort(got[0].compare))).toEqual(["b", "a"]);
  });

  it("regroups everything but the fixed tail groups", () => {
    const got = applyViewOptions(defaults, opts({ group: "priority" }), { now: NOW });
    expect(got.map((g) => [g.key, ids(g.tasks)])).toEqual([
      ["priority:urgent", []],
      ["priority:high", ["t1"]],
      ["priority:normal", ["o", "t2"]],
      ["priority:low", []],
      ["others", ["x"]],
    ]);
    const high = got[1];
    expect(high.dropArgs?.(task("t2"))).toEqual({ priority: "high" });
    expect(got[0].dropZoneOnly).toBe(true);
  });

  it("refuses drops between label groups", () => {
    const got = applyViewOptions(defaults, opts({ group: "label" }), { now: NOW });
    for (const g of got.filter((x) => !x.fixed)) expect(g.dropArgs?.(task("t2")) ?? null).toBeNull();
  });
});

describe("filterTasks", () => {
  const tasks = [
    task("a", { priority: "urgent", tags: ["admin"], due: "2026-10-10", owner: "ann" }),
    task("b", { priority: "high", tags: ["admin", "home"], due: "2026-10-15", owner: "bob", deadline: "2026-10-20" }),
    task("c", { priority: "normal", tags: ["home"], due: "2026-10-30", blocked_by: ["a"] }),
    task("d", { priority: "low", due: null, blocked_by: ["gone"] }),
  ];
  const openIds = new Set(["a", "b", "c", "d"]);
  const ctx = { now: NOW, openIds };

  it("returns the input untouched when no filter is set", () => {
    expect(filterTasks(tasks, {}, ctx)).toBe(tasks);
    expect(filtersActive({})).toBe(false);
    expect(filtersActive({ labels: [] })).toBe(false);
    expect(filtersActive({ blocked: true })).toBe(true);
  });

  it("ORs the values inside one filter", () => {
    expect(ids(filterTasks(tasks, { priority: ["urgent", "low"] }, ctx))).toEqual(["a", "d"]);
    expect(ids(filterTasks(tasks, { labels: ["admin", "home"] }, ctx))).toEqual(["a", "b", "c"]);
    expect(ids(filterTasks(tasks, { due: ["overdue", "none"] }, ctx))).toEqual(["a", "d"]);
    expect(ids(filterTasks(tasks, { assignees: ["ann", ""] }, ctx))).toEqual(["a", "c", "d"]);
  });

  it("ANDs different filters", () => {
    expect(ids(filterTasks(tasks, { labels: ["admin"], priority: ["high", "low"] }, ctx))).toEqual(["b"]);
    expect(ids(filterTasks(tasks, { labels: ["home"], due: ["overdue"] }, ctx))).toEqual([]);
  });

  it("filters on a deadline", () => {
    expect(ids(filterTasks(tasks, { hasDeadline: true }, ctx))).toEqual(["b"]);
    expect(ids(filterTasks(tasks, { hasDeadline: false }, ctx))).toEqual(["a", "c", "d"]);
  });

  it("uses the readiness the row shows: blocked means an open blocker, not a blocked_by entry", () => {
    expect(ids(filterTasks(tasks, { blocked: true }, ctx))).toEqual(["c"]);
    expect(ids(filterTasks(tasks, { blocked: false }, ctx))).toEqual(["a", "b", "d"]);
  });

  it("keeps a label nobody carries as a filter that matches nothing", () => {
    expect(filterTasks(tasks, { labels: ["errand"] }, ctx)).toEqual([]);
  });
});

describe("filterChips", () => {
  const name = (id: string) => (id === "ann" ? "Ann" : id);
  it("makes one chip per active filter, in menu order, with readable values", () => {
    const f = { priority: ["urgent" as const, "high" as const], due: ["overdue" as const], labels: ["admin"], assignees: ["ann", ""], hasDeadline: true, blocked: true };
    expect(filterChips(f, name).map((c) => c.label)).toEqual([
      "Priority: Urgent, High",
      "Due: Overdue",
      "Label: admin",
      "Assignee: Ann, Unassigned",
      "Has deadline",
      "Blocked",
    ]);
  });

  it("removing a chip clears only its filter, even for a label that no longer exists", () => {
    const f = { labels: ["errand"], priority: ["high" as const] };
    const chips = filterChips(f, name);
    expect(chips.map((c) => c.label)).toEqual(["Priority: High", "Label: errand"]);
    expect(chips[1].clear(f)).toEqual({ priority: ["high"] });
    expect(filtersActive(chips[0].clear(chips[1].clear(f)))).toBe(false);
  });
});

describe("applyViewOptions with filters", () => {
  const defaults: TaskGroupSpec[] = [
    { key: "today", tasks: [task("t1", { tags: ["admin"] }), task("t2")], compare: compareByDue },
    { key: "others", title: "Agents", tasks: [task("x", { tags: ["admin"] }), task("y")], compare: compareByDue, fixed: true },
  ];

  it("filters every group, the fixed tail included, and keeps the group shape", () => {
    const got = applyViewOptions(defaults, opts({ filters: { labels: ["admin"] } }), { now: NOW });
    expect(got.map((g) => [g.key, ids(g.tasks)])).toEqual([
      ["today", ["t1"]],
      ["others", ["x"]],
    ]);
  });

  it("filters before regrouping", () => {
    const got = applyViewOptions(defaults, opts({ group: "priority", filters: { labels: ["admin"] } }), { now: NOW });
    expect(got.flatMap((g) => ids(g.tasks)).sort()).toEqual(["t1", "x"]);
  });
});

describe("timing pin (tech.md § Performance Budget)", () => {
  const pri = ["urgent", "high", "normal", "low", null] as const;
  const tasks = Array.from({ length: 2000 }, (_, i) =>
    task(`t-${i}`, {
      title: `Task ${(i * 7919) % 2000}`,
      due: i % 5 === 0 ? null : `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`,
      priority: pri[i % 5],
      order: (i * 31) % 997,
      project: i % 3 ? `p${i % 7}` : null,
      tags: i % 4 ? [`l${i % 9}`] : [],
    }),
  );
  /** Min of 10 timed runs after one warm-up; the vector prints on failure. */
  const minOf10 = (fn: () => void) => {
    const once = () => {
      const t0 = performance.now();
      fn();
      return performance.now() - t0;
    };
    once();
    const times = Array.from({ length: 10 }, once);
    return { min: Math.min(...times), vector: times.map((t) => t.toFixed(2)).join(", ") };
  };

  it("groups and sorts all 2,000 tasks (no filter) in ≤ 8 ms", () => {
    const { min, vector } = minOf10(() => {
      const groups = groupTasks(tasks, "due", { now: NOW });
      for (const g of groups) sortTasks(g.tasks, "due", "asc");
    });
    expect(min, `group+sort times (ms): ${vector}`).toBeLessThanOrEqual(8);
  });

  it("filters 2,000 tasks in ≤ 8 ms", () => {
    const f = { priority: ["urgent", "high", "normal"] as ("urgent" | "high" | "normal")[], labels: ["l1", "l2", "l3", "l5"], due: ["overdue", "today", "later"] as ("overdue" | "today" | "later")[] };
    const { min, vector } = minOf10(() => {
      filterTasks(tasks, f, { now: NOW });
    });
    expect(min, `filter times (ms): ${vector}`).toBeLessThanOrEqual(8);
  });
});
