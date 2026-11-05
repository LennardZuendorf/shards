import { describe, expect, it } from "vitest";
import { inboxTasks } from "@/components/task/group-specs";
import type { Task } from "@/lib/types";

/**
 * Matrix row: "Inbox view (tasks with no project)" — the derivation `InboxView.tsx` renders is
 * `inboxTasks` (it used to be the same filter inline). These assertions are about that
 * derivation only; the row's app-mode step is desktop-app/22.
 */
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: null,
    created: "2026-11-01T00:00:00Z",
    updated: "2026-11-01T00:00:00Z",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

const ids = (tasks: readonly Task[]) => tasks.map((t) => t.id);

describe("Inbox view (tasks with no project)", () => {
  it("shows open tasks with no project, in list order", () => {
    expect(ids(inboxTasks([task("b"), task("a")]))).toEqual(["b", "a"]);
  });

  it("shows a claimed task with no project: it is still waiting on someone", () => {
    const claimed = task("c", { status: "claimed", claimed_by: "claude" });
    expect(ids(inboxTasks([task("a"), claimed]))).toEqual(["a", "c"]);
  });

  it("hides a task that has a project", () => {
    const filed = task("p", { project: "Launch", due: "2026-11-01", priority: "urgent" });
    expect(ids(inboxTasks([filed, task("i")]))).toEqual(["i"]);
  });

  it("hides a project-less-looking task whose project field is still set on an archived project", () => {
    const shelved = task("x", { project: "Old" });
    expect(ids(inboxTasks([shelved]))).toEqual([]);
  });

  it("counts the optimistic clear (project: \"\") as no project, so a task moved to the Inbox appears", () => {
    const moving = task("m", { project: "" });
    expect(ids(inboxTasks([moving]))).toEqual(["m"]);
  });

  it("hides project-less work that is done or cancelled", () => {
    const done = task("d", { status: "done", completed: "2026-11-02T10:00:00Z" });
    const cancelled = task("x", { status: "cancelled" });
    expect(ids(inboxTasks([done, cancelled, task("o")]))).toEqual(["o"]);
  });

  it("keeps a project-less subtask (it renders as a root under its parent) and hides a filed one", () => {
    const parent = task("t-parent");
    const inboxChild = task("t-inbox-child", { parent: "t-parent", order: 1 });
    const filedChild = task("t-filed-child", { parent: "t-parent", project: "Launch", order: 2 });
    expect(ids(inboxTasks([parent, filedChild, inboxChild]))).toEqual(["t-parent", "t-inbox-child"]);
  });
});
