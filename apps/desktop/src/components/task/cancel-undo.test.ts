import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
vi.mock("@/lib/transport", async (orig) => ({
  ...(await orig<typeof import("@/lib/transport")>()),
  call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    return { id: args.task_id ?? args.id, status: tool === "shards_task_update" ? "open" : "cancelled" };
  }),
}));

import { cancelTask, undoCancel } from "./actions";
import { statusDrop } from "./model";

const task = (status: Task["status"]): Task =>
  ({ id: "t-1", type: "task", title: "T", tags: [], owner: null, created: null, updated: null, status, priority: null, claimed_by: null, project: null, blocks: [], blocked_by: [] }) as Task;

beforeEach(() => {
  calls.length = 0;
});

describe("drop on the Cancelled column", () => {
  it("an open card maps to cancel, which calls shards_task_cancel", async () => {
    expect(statusDrop(task("open"), "cancelled")).toBe("cancel");
    await cancelTask(task("open"));
    expect(calls).toEqual([{ tool: "shards_task_cancel", args: { task_id: "t-1" } }]);
  });
  it("undo of an open card reopens it", async () => {
    await undoCancel(task("open"));
    expect(calls.map((c) => [c.tool, c.args.status])).toEqual([["shards_task_update", "open"]]);
  });
  it("undo of a done card goes back to done (reopen, then finish)", async () => {
    expect(statusDrop(task("done"), "cancelled")).toBe("reopen-cancel");
    await undoCancel(task("done"));
    expect(calls.map((c) => c.tool)).toEqual(["shards_task_update", "shards_task_finish"]);
  });
});
