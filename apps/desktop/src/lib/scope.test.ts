import { describe, expect, it } from "vitest";
import { countTopLevel, isMine, projectCounts, splitMine } from "./scope";
import type { Task } from "./types";

const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, type: "task", title: id, tags: [], owner: null, created: null, updated: null, related: [], status: "open", priority: null, claimed_by: null, project: null, blocks: [], blocked_by: [], ...extra }) as Task;

describe("isMine", () => {
  it("is mine when I own it, nobody owns it, or I hold the claim", () => {
    expect(isMine(task("a", { owner: "lennard" }), "lennard")).toBe(true);
    expect(isMine(task("b"), "lennard")).toBe(true);
    expect(isMine(task("c", { owner: "flights-agent", claimed_by: "lennard" }), "lennard")).toBe(true);
    expect(isMine(task("d", { owner: "flights-agent" }), "lennard")).toBe(false);
  });

  it("treats everything as mine when the acting identity is unknown", () => {
    expect(isMine(task("d", { owner: "flights-agent" }), null)).toBe(true);
  });

  it("splits in order", () => {
    const { mine, others } = splitMine([task("a"), task("b", { owner: "x" }), task("c")], "me");
    expect(mine.map((t) => t.id)).toEqual(["a", "c"]);
    expect(others.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("counts", () => {
  it("counts a subtask only when its parent is not in the set", () => {
    // t-2 is a child of open t-1; t-3's parent is done (not listed), so it renders as a root.
    expect(countTopLevel([task("t-1"), task("t-2", { parent: "t-1" }), task("t-3", { parent: "t-gone" })])).toBe(2);
  });

  it("counts open top-level tasks per project, the number every surface shows", () => {
    const m = projectCounts([
      task("a", { project: "n-p" }),
      task("b", { project: "n-p", parent: "a" }),
      task("c", { project: "n-p", status: "claimed" }),
      task("d", { project: "n-q", status: "done" }),
      task("e"),
    ]);
    expect([...m]).toEqual([["n-p", 2]]);
  });
});
