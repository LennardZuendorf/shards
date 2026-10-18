import { describe, expect, it } from "vitest";
import type { Member, Task } from "@/lib/types";
import { buildBoard, collectMembers, isDoneToday, sortQueue } from "./agent-utils";

const NOW = new Date(2026, 9, 15, 15, 0);

function task(over: Partial<Task> & { id: string }): Task {
  return {
    type: "task",
    title: over.id,
    tags: [],
    owner: null,
    created: "2026-10-10T00:00:00Z",
    updated: "2026-10-10T00:00:00Z",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

const members: Member[] = [
  { id: "lennard", kind: "human", name: "Lennard" },
  { id: "claude-code", kind: "agent", name: "Claude Code" },
];

describe("delegation board", () => {
  const T1 = task({ id: "t-1", owner: "claude-code", claimed_by: "claude-code", status: "claimed", blocks: ["t-6"] });
  const T6 = task({ id: "t-6", owner: "claude-code", blocked_by: ["t-1"] });
  const T3 = task({ id: "t-3", owner: "codex-agent", tags: ["needs-input"], priority: "urgent" });
  const T5 = task({ id: "t-5", owner: "lennard", priority: "high" });
  const T9 = task({ id: "t-9", owner: "claude-code", blocked_by: ["t-5"] });
  const done = task({ id: "t-d", owner: "claude-code", status: "done", completed: new Date(2026, 9, 15, 9).toISOString() });

  it("does not count a blocker the agent itself holds as awaiting input", () => {
    const b = buildBoard({ members, me: "lennard", open: [T1, T6], done: [], now: NOW });
    const claude = b.agents.find((c) => c.member.id === "claude-code");
    expect(claude?.state).toBe("working");
    expect(claude?.awaiting).toEqual([]);
    expect(b.summary.awaitingYou).toBe(0);
  });

  it("counts needs-input labels and human-held blockers", () => {
    const b = buildBoard({ members, me: "lennard", open: [T1, T6, T3, T5, T9], done: [done], now: NOW });
    const codex = b.agents.find((c) => c.member.id === "codex-agent");
    const claude = b.agents.find((c) => c.member.id === "claude-code");
    expect(codex?.state).toBe("awaiting");
    expect(claude?.awaiting.map((t) => t.id)).toEqual(["t-9"]);
    expect(b.summary).toEqual({ agentsWorking: 1, inProgress: 1, awaitingYou: 2, doneToday: 1 });
    // awaiting sorts before working
    expect(b.agents[0].state).toBe("awaiting");
    expect(b.humans[0].member.id).toBe("lennard");
    expect(claude?.doneToday).toBe(1);
  });

  it("puts ready tasks first in the queue, then priority", () => {
    const q = sortQueue([T6, task({ id: "t-x", priority: "low" }), task({ id: "t-y", priority: "urgent" })]);
    expect(q.map((t) => t.id)).toEqual(["t-y", "t-x", "t-6"]);
    const r = sortQueue([T6, task({ id: "t-x" })], new Set(["t-6"]));
    expect(r[0].id).toBe("t-6");
  });

  it("collects identities from scratch, memories and tasks", () => {
    const all = collectMembers({
      members,
      me: "lennard",
      open: [T3],
      done: [],
      scratch: [{ type: "scratch", name: "plan", agent: "helper", tags: [], created: null, updated: null }],
    });
    expect(all.map((m) => m.id).sort()).toEqual(["claude-code", "codex-agent", "helper", "lennard"]);
    expect(all.find((m) => m.id === "helper")?.kind).toBe("agent");
  });

  it("falls back to updated for done-today on a v1 core", () => {
    expect(isDoneToday(task({ id: "a", status: "done", updated: new Date(2026, 9, 15, 8).toISOString() }), NOW)).toBe(true);
    expect(isDoneToday(task({ id: "b", status: "done", updated: new Date(2026, 9, 14, 8).toISOString() }), NOW)).toBe(false);
    expect(isDoneToday(task({ id: "c", status: "open" }), NOW)).toBe(false);
  });
});

describe("sign of life", () => {
  it("does not count a change to a task the agent only owns as the agent being seen", () => {
    const owned = { id: "t-1", type: "task", title: "Book flights", path: "/v/tasks/open/t-1.md", mtime: NOW.getTime() / 1000 - 60, owner: "claude-code", claimed_by: null };
    const held = { ...owned, id: "t-2", path: "/v/tasks/open/t-2.md", mtime: NOW.getTime() / 1000 - 3600, claimed_by: "claude-code" };
    const only = buildBoard({ members, me: "lennard", open: [], done: [], activity: [owned], now: NOW });
    const a = only.agents.find((c) => c.member.id === "claude-code");
    expect(a?.lastSeen).toBeNull();
    // The change still shows in the card's activity, without naming a writer.
    expect(a?.activity.map((r) => r.id)).toEqual(["t-1"]);
    const both = buildBoard({ members, me: "lennard", open: [], done: [], activity: [owned, held], now: NOW });
    expect(both.agents.find((c) => c.member.id === "claude-code")?.lastSeen).toBe(held.mtime * 1000);
  });
});

