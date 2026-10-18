import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_OPTIONS } from "@/lib/ui-contract";
import type { Task } from "@/lib/types";
import { applyViewOptions } from "@/lib/view-options";
import { labelGroups, sectionGroups, todayGroups, todaySets, upcomingRange, upcomingGroups } from "./group-specs";
import type { TaskGroupSpec } from "./TaskList";

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

/** Group keys and the ids in each group, in shown order (roots sorted by the group's compare). */
const shape = (groups: TaskGroupSpec[]) => groups.map((g) => [g.key, [...g.tasks].sort(g.compare).map((t) => t.id)]);

const ALL = [
  task("o2", { due: "2026-10-13", priority: "high" }),
  task("o1", { due: "2026-10-13", priority: "urgent" }),
  task("t1", { due: "2026-10-15T09:00" }),
  task("t2", { due: "2026-10-15", owner: "claude" }),
  task("u1", { due: "2026-10-17", tags: ["admin"], project: "p2" }),
  task("u2", { due: "2026-11-30", tags: ["admin"] }),
  task("n1", { project: "p1", section: "Next", order: 2, tags: ["admin"] }),
  task("n2", { project: "p1", order: 1 }),
  task("n3", { project: "p1", section: "Later", order: 3 }),
  task("d1", { status: "done" }),
];

describe("delivered groupings (snapshot of group keys per view)", () => {
  it("Today: Overdue then Today, Mine hides delegated work", () => {
    const sets = todaySets(ALL, NOW, "mine", "lennard");
    expect(shape(todayGroups(sets, NOW))).toEqual([
      ["overdue", ["o1", "o2"]],
      ["today", ["t1"]],
    ]);
    expect(sets.others.map((t) => t.id)).toEqual(["t2"]);
  });

  it("Upcoming: Overdue, one group per day from today, then Later", () => {
    const days = upcomingRange("2026-10-15", 0);
    expect(days).toHaveLength(14);
    const g = upcomingGroups(ALL, days, "everyone", null);
    const s = shape(g.groups);
    expect(s[0]).toEqual(["overdue", ["o1", "o2"]]);
    expect(s[1]).toEqual(["day:2026-10-15", ["t1", "t2"]]);
    expect(s[3]).toEqual(["day:2026-10-17", ["u1"]]);
    expect(s.map((x) => x[0]).slice(1, 15)).toEqual(days.map((d) => `day:${d.key}`));
    expect(s[15]).toEqual(["later", ["u2"]]);
    expect(s).toHaveLength(16);
  });

  it("Label: grouped by project, Inbox first, then sidebar order", () => {
    const tasks = ALL.filter((t) => t.tags.includes("admin"));
    expect(shape(labelGroups(tasks, ["p1", "p2"], (id) => id ?? "Inbox", "admin"))).toEqual([
      ["p:", ["u2"]],
      ["p:p1", ["n1"]],
      ["p:p2", ["u1"]],
    ]);
  });

  it("Project and Inbox: unsectioned head, then known sections, manual order", () => {
    const tasks = ALL.filter((t) => t.project === "p1");
    expect(shape(sectionGroups(tasks, ["Next", "Later", "Empty"], "p1", null))).toEqual([
      ["s:", ["n2"]],
      ["s:Next", ["n1"]],
      ["s:Later", ["n3"]],
      ["s:Empty", []],
    ]);
  });

  it("default options return every view's delivered groups unchanged", () => {
    const sets = todaySets(ALL, NOW, "everyone", null);
    const views = [
      todayGroups(sets, NOW),
      upcomingGroups(ALL, upcomingRange("2026-10-15", 0), "everyone", null).groups,
      labelGroups(ALL, ["p1"], (id) => id ?? "Inbox", "admin"),
      sectionGroups(ALL.filter((t) => t.project === "p1"), ["Next"], "p1", [task("d1", { status: "done" })]),
    ];
    for (const groups of views) expect(applyViewOptions(groups, DEFAULT_VIEW_OPTIONS, { now: NOW })).toBe(groups);
  });

  it("marks the completed tail as fixed so view options leave it alone", () => {
    const g = sectionGroups([task("a", { project: "p1" })], [], "p1", [task("d1", { status: "done" })]);
    expect(g.at(-1)).toMatchObject({ key: "completed", fixed: true });
  });
});
