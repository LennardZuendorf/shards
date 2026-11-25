/** R39: the "Waiting on me" queue — membership, order and the derived wait start. */
import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { waitStart, waitingOnMe } from "./status";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  type: "task",
  title: `Task ${id}`,
  tags: [],
  owner: "claude",
  created: "2026-11-01T00:00:00Z",
  updated: "2026-11-01T00:00:00Z",
  status: "open",
  priority: "normal",
  claimed_by: null,
  project: null,
  blocks: [],
  blocked_by: [],
  ...over,
});

/** A task body as the core writes it: description, then the stamped comment. */
const body = (stamps: [string, string, string][]): string =>
  ["Do the thing.", "", "## Comments", "", ...stamps.flatMap(([at, who, text]) => [`${at} — ${who}`, text, ""])].join("\n");

const ids = (rows: { task: Task }[]) => rows.map((r) => r.task.id);

describe("waitingOnMe", () => {
  it("lists exactly the needs-input task among one task per state", () => {
    const tasks = [
      task("t-open"),
      task("t-claimed", { status: "claimed", claimed_by: "claude", updated: "2026-11-25T08:00:00Z" }),
      task("t-waiting", { status: "claimed", claimed_by: "claude", tags: ["needs-input"] }),
      task("t-done", { status: "done", tags: ["needs-input"], completed: "2026-11-24T08:00:00Z" }),
    ];
    expect(ids(waitingOnMe(tasks, "lennard"))).toEqual(["t-waiting"]);
  });

  it("orders by wait age, the older wait first", () => {
    const tasks = [
      task("t-younger", { status: "claimed", claimed_by: "codex", tags: ["needs-input"] }),
      task("t-older", { status: "claimed", claimed_by: "claude", tags: ["needs-input"] }),
    ];
    const bodies = new Map([
      ["t-older", body([["2026-11-25T06:00:00Z", "claude", "Which vault?"]])],
      ["t-younger", body([["2026-11-25T08:00:00Z", "codex", "Approve the copy?"]])],
    ]);
    expect(ids(waitingOnMe(tasks, "lennard", { bodies }))).toEqual(["t-older", "t-younger"]);
  });

  it("never lists a task inside an archived project, and does without the filter", () => {
    const tasks = [task("t-archived", { tags: ["needs-input"], project: "n-arch" })];
    expect(ids(waitingOnMe(tasks, "lennard", { archived: new Set(["n-arch"]) }))).toEqual([]);
    // Negative control: drop the archived set and the row comes back — the filter is what hides it.
    expect(ids(waitingOnMe(tasks, "lennard"))).toEqual(["t-archived"]);
  });

  it("takes the wait start from the newest stamp that is not the operator's own", () => {
    const tasks = [task("t-reply", { status: "claimed", claimed_by: "claude", tags: ["needs-input"] })];
    const bodies = new Map([
      [
        "t-reply",
        body([
          ["2026-11-25T06:00:00Z", "claude", "Which vault?"],
          ["2026-11-25T08:55:00Z", "lennard", "prod, I think"],
        ]),
      ],
    ]);
    const [row] = waitingOnMe(tasks, "lennard", { bodies });
    expect(row.since).toBe("2026-11-25T06:00:00Z");
    expect(row.agent).toBe("claude");
    expect(row.message).toBe("Which vault?");
  });

  it("falls back to `updated` when only the operator has stamped the body", () => {
    const tasks = [
      task("t-mine", { status: "claimed", claimed_by: "claude", tags: ["needs-input"], updated: "2026-11-25T07:00:00Z" }),
    ];
    const bodies = new Map([["t-mine", body([["2026-11-25T08:55:00Z", "lennard", "On it"]])]]);
    const [row] = waitingOnMe(tasks, "lennard", { bodies });
    expect(row.since).toBe("2026-11-25T07:00:00Z");
    expect(row.message).toBeNull();
  });

  it("reports an error label as an error row", () => {
    const tasks = [task("t-error", { status: "claimed", claimed_by: "codex", tags: ["agent-error"] })];
    expect(waitingOnMe(tasks, "lennard")[0].kind).toBe("error");
  });

  it("lists a task blocked by the operator's own open task, once", () => {
    const operatorTask = task("t-approve", { owner: "lennard" });
    const blocked = task("t-ship", {
      status: "claimed",
      claimed_by: "codex",
      owner: "codex",
      blocked_by: ["t-approve"],
    });
    const both = task("t-both", { status: "claimed", claimed_by: "codex", tags: ["needs-input"], blocked_by: ["t-approve"] });
    const rows = waitingOnMe([operatorTask, blocked, both], "lennard");
    expect(ids(rows)).toEqual(expect.arrayContaining(["t-ship", "t-both"]));
    expect(rows.filter((r) => r.task.id === "t-both")).toHaveLength(1);
    expect(rows.find((r) => r.task.id === "t-both")?.kind).toBe("needs-input");
    expect(rows.find((r) => r.task.id === "t-ship")?.blocker?.id).toBe("t-approve");
  });

  it("does not list a task blocked by another agent's open task", () => {
    const agentTask = task("t-agent", { status: "claimed", claimed_by: "claude", owner: "claude" });
    const blocked = task("t-waiting-on-agent", { blocked_by: ["t-agent"] });
    expect(ids(waitingOnMe([agentTask, blocked], "lennard"))).toEqual([]);
  });

  it("never lists finished or cancelled tasks", () => {
    const tasks = [
      task("t-done", { status: "done", tags: ["needs-input"] }),
      task("t-cancelled", { status: "cancelled", tags: ["agent-error"] }),
    ];
    expect(waitingOnMe(tasks, "lennard")).toEqual([]);
  });
});

describe("waitStart", () => {
  it("reads the newest non-operator stamp even when an older one follows out of order", () => {
    const t = task("t-1", { updated: "2026-11-01T00:00:00Z" });
    const b = body([
      ["2026-11-25T09:00:00Z", "codex", "Newest"],
      ["2026-11-25T06:00:00Z", "claude", "Older"],
    ]);
    expect(waitStart(t, "lennard", b)).toEqual({
      since: "2026-11-25T09:00:00Z",
      agent: "codex",
      message: "Newest",
    });
  });

  it("has no message when the body carries no stamp", () => {
    const t = task("t-2", { updated: "2026-11-20T10:00:00Z", claimed_by: "claude" });
    expect(waitStart(t, "lennard", "Just a description.")).toEqual({
      since: "2026-11-20T10:00:00Z",
      agent: "claude",
      message: null,
    });
  });
});
