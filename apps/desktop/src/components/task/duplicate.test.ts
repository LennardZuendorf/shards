import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { duplicateArgs } from "./duplicate";

/**
 * Matrix row: "Duplicate task" — `duplicateArgs` is the create payload `actions.duplicate` sends
 * (`TaskMenu` → Duplicate). The copy is asserted against the source; the row's app-mode step is
 * desktop-app/22.
 */
function task(over: Partial<Task> = {}): Task {
  return {
    id: "t-source",
    type: "task",
    title: "Ship the release",
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

describe("Duplicate task", () => {
  it("copies every field the source carries and nothing else", () => {
    const source = task({
      priority: "urgent",
      tags: ["release", "ops"],
      owner: "lennard",
      project: "Shards",
      due: "2026-11-20T09:30",
      deadline: "2026-11-22",
      recur: "FREQ=WEEKLY;BYDAY=MO",
      recur_from: "completion",
      parent: "t-parent",
      section: "Next",
      order: 3,
    });
    expect(duplicateArgs(source, undefined)).toEqual({
      title: "Ship the release",
      priority: "urgent",
      tags: ["release", "ops"],
      owner: "lennard",
      project: "Shards",
      body: undefined,
      due: "2026-11-20T09:30",
      deadline: "2026-11-22",
      recur: "FREQ=WEEKLY;BYDAY=MO",
      recur_from: "completion",
      parent: "t-parent",
      section: "Next",
      order: 3.5,
    });
  });

  it("keeps the parent/section/order triple: the copy is a sibling in the same section, right after it", () => {
    const source = task({ parent: "t-parent", section: "Next", order: 7 });
    const copy = duplicateArgs(source, undefined);
    expect({ parent: copy.parent, section: copy.section, order: copy.order }).toEqual({ parent: "t-parent", section: "Next", order: 7.5 });
    expect(copy.order).toBeGreaterThan(source.order as number);
  });

  it("carries agent-written Markdown verbatim, one trailing newline, no reflow", () => {
    const body = [
      "## Agent plan",
      "",
      "- [ ] step one",
      "- [x] step two",
      "",
      "```sh",
      "shards task list --mine",
      "```",
      "",
      "**Bold**, _italic_ and a [link](https://example.com).",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
    ].join("\n");
    expect(duplicateArgs(task(), body).body).toBe(body);
    expect(duplicateArgs(task(), `\n\n  ${body}  \n\n`).body).toBe(body);
  });

  it("sends no body when the source has none", () => {
    expect(duplicateArgs(task(), undefined).body).toBeUndefined();
    expect(duplicateArgs(task(), "").body).toBeUndefined();
    expect(duplicateArgs(task(), "  \n\t\n").body).toBeUndefined();
  });

  it("starts the copy open: no status, no completed, no dependencies", () => {
    const source = task({ status: "done", completed: "2026-11-02T10:00:00Z", blocks: ["t-a"], blocked_by: ["t-b"] });
    const copy = duplicateArgs(source, undefined);
    expect(copy).not.toHaveProperty("status");
    expect(copy).not.toHaveProperty("completed");
    expect(copy).not.toHaveProperty("blocks");
    expect(copy).not.toHaveProperty("blocked_by");
  });

  it("duplicates an Inbox task back into the Inbox and a filed one into its project", () => {
    expect(duplicateArgs(task({ project: null, parent: null, section: null }), undefined)).toMatchObject({
      project: undefined,
      parent: undefined,
      section: undefined,
      order: undefined,
    });
    expect(duplicateArgs(task({ project: "Shards" }), undefined).project).toBe("Shards");
  });

  it("defaults recur_from to due when the source does not say, and never sends one without recur", () => {
    expect(duplicateArgs(task({ recur: "FREQ=DAILY" }), undefined).recur_from).toBe("due");
    expect(duplicateArgs(task({ recur: null, recur_from: "completion" }), undefined).recur_from).toBeUndefined();
  });

  it("leaves the source task unchanged", () => {
    const source = task({ tags: ["a"], order: 2, due: "2026-11-20", body: "source body" });
    const before = structuredClone(source);
    duplicateArgs(source, "## body");
    expect(source).toEqual(before);
  });
});
