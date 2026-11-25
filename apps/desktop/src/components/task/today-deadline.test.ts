/**
 * Today lists a task by its `due` **or** its `deadline` (desktop-app R3): overdue when either is
 * before today, today when either is today. The two stay distinct — a task planned for Friday
 * with a deadline today belongs in Today, and a deadline-only task is not "no date".
 */
import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { isTodayTask } from "@/lib/hooks";
import { todayGroups, todaySets } from "./group-specs";
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
const TODAY = "2026-10-15";
const NEXT_WEEK = "2026-10-22";
const YESTERDAY = "2026-10-14";

const ids = (tasks: Task[]) => tasks.map((t) => t.id).sort();
const sorted = (groups: TaskGroupSpec[]) => groups.map((g) => [g.key, [...g.tasks].sort(g.compare).map((t) => t.id)]);

describe("Today lists by due or deadline (R3)", () => {
  it("includes a task whose deadline is today but whose due date is next week", () => {
    const sets = todaySets([task("ship", { due: NEXT_WEEK, deadline: TODAY })], NOW, "everyone", null);
    expect(ids(sets.today)).toEqual(["ship"]);
    expect(sets.overdue).toEqual([]);
  });

  it("includes a task due today with a later deadline", () => {
    const sets = todaySets([task("plan", { due: TODAY, deadline: NEXT_WEEK })], NOW, "everyone", null);
    expect(ids(sets.today)).toEqual(["plan"]);
    expect(sets.overdue).toEqual([]);
  });

  it("puts a task that is overdue only by deadline under Overdue", () => {
    const sets = todaySets([task("late", { due: NEXT_WEEK, deadline: YESTERDAY })], NOW, "everyone", null);
    expect(ids(sets.overdue)).toEqual(["late"]);
    expect(sets.today).toEqual([]);
  });

  it("keeps a task that is overdue by due and today by deadline under Overdue once", () => {
    const sets = todaySets([task("both", { due: YESTERDAY, deadline: TODAY })], NOW, "everyone", null);
    expect(ids(sets.overdue)).toEqual(["both"]);
    expect(sets.today).toEqual([]);
  });

  it("leaves a task with neither date out of Today", () => {
    const sets = todaySets([task("someday")], NOW, "everyone", null);
    expect(sets.overdue).toEqual([]);
    expect(sets.today).toEqual([]);
  });

  it("leaves a task dated later by both out of Today", () => {
    const sets = todaySets([task("later", { due: NEXT_WEEK, deadline: NEXT_WEEK })], NOW, "everyone", null);
    expect(sets.overdue).toEqual([]);
    expect(sets.today).toEqual([]);
  });

  it("orders Today by the earlier of due and deadline, then priority", () => {
    const sets = todaySets(
      [
        task("due-today", { due: TODAY }),
        task("deadline-today", { due: NEXT_WEEK, deadline: TODAY, priority: "urgent" }),
        task("deadline-yesterday", { due: NEXT_WEEK, deadline: YESTERDAY }),
      ],
      NOW,
      "everyone",
      null,
    );
    expect(sorted(todayGroups(sets, NOW))).toEqual([
      ["overdue", ["deadline-yesterday"]],
      ["today", ["deadline-today", "due-today"]],
    ]);
  });

  it("counts the same set in the sidebar badge the view renders", () => {
    expect(isTodayTask(task("deadline-today", { deadline: TODAY }), NOW)).toBe(true);
    expect(isTodayTask(task("deadline-late", { due: NEXT_WEEK, deadline: YESTERDAY }), NOW)).toBe(true);
    expect(isTodayTask(task("due-today", { due: TODAY }), NOW)).toBe(true);
    expect(isTodayTask(task("someday"), NOW)).toBe(false);
    expect(isTodayTask(task("later", { due: NEXT_WEEK, deadline: NEXT_WEEK }), NOW)).toBe(false);
  });
});
