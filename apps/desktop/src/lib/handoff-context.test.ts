import { expect, it } from "vitest";
import type { Task } from "./types";
import { handoffContext } from "./handoff-context";

const task: Task = { id: "t-one", type: "task", title: "Example", tags: [], created: null, updated: null,
  priority: "normal", project: null, blocks: [], blocked_by: [], status: "open", owner: "me", claimed_by: null };
it("offers assignment only for open unclaimed work with an operator", () => {
  expect(handoffContext(task, "me")).toEqual({ canAssign: true, canTakeBack: false, canRelease: false });
  expect(handoffContext(task, null).canAssign).toBe(false);
  expect(handoffContext(null, "me").canAssign).toBe(false);
  expect(handoffContext({ ...task, status: "done" }, "me").canAssign).toBe(false);
});
it("requires release before reassignment and distinguishes accountable ownership", () => {
  expect(handoffContext({ ...task, status: "claimed", claimed_by: "worker" }, "me")).toEqual({ canAssign: false, canTakeBack: true, canRelease: true });
  expect(handoffContext({ ...task, status: "claimed", claimed_by: "me" }, "me").canTakeBack).toBe(false);
  expect(handoffContext({ ...task, owner: "other", status: "claimed", claimed_by: "worker" }, "me").canTakeBack).toBe(false);
});
