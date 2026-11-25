/**
 * R39 — the Waiting on me queue lists exactly the tasks that wait for the operator, longest wait
 * first, with the agent, the wait age and the question the agent left; a task in an archived
 * project never reaches it.
 *
 * `WaitingView` is rendered with `renderToStaticMarkup`: there is no DOM and no host here, so the
 * data hooks, the per-row body query and the shell wrapper are stubbed and the assertions read the
 * rendered rows (`data-task-row`), which is what an operator sees.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Project, Task } from "@/lib/types";

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

const body = (stamps: [string, string, string][]): string =>
  ["Do the thing.", "", "## Comments", "", ...stamps.flatMap(([at, who, text]) => [`${at} — ${who}`, text, ""])].join("\n");

const data = {
  tasks: [
    task("t-open"),
    task("t-working", { status: "claimed", claimed_by: "claude" }),
    task("t-waiting", { status: "claimed", claimed_by: "claude", tags: ["needs-input"], project: "n-active" }),
    task("t-done", { status: "done", tags: ["needs-input"], completed: "2026-11-24T08:00:00Z" }),
    task("t-archived", { status: "claimed", claimed_by: "claude", tags: ["needs-input"], project: "n-arch" }),
  ],
  projects: [
    { id: "n-active", title: "Launch", color: null, sections: [], open_count: 1 },
    { id: "n-arch", title: "Old work", color: null, sections: [], open_count: 1, archived: true },
  ] as Project[],
};

const bodies: Record<string, string> = {
  "t-waiting": body([["2026-11-25T08:00:00Z", "claude", "Which vault?"]]),
  "t-archived": body([["2026-11-25T08:00:00Z", "claude", "Still here?"]]),
};

vi.mock("@/lib/hooks", () => ({
  useTasks: () => ({ data: data.tasks, isLoading: false, error: null, refetch: vi.fn() }),
  useProjects: () => ({ data: data.projects, isLoading: false, error: null }),
  useMemberMap: () => new Map([["claude", { id: "claude", kind: "agent", name: "claude-code" }]]),
  useMe: () => "lennard",
}));

// The view asks `shards_task_get` once per queued row; the stub answers from the same fixture.
vi.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: { queryKey: (string | object)[] }[] }) =>
    queries.map((q) => ({ data: { body: bodies[String(q.queryKey[2])] ?? "" } })),
}));

vi.mock("@/lib/now", () => ({ useNow: () => new Date("2026-11-25T10:00:00Z") }));
vi.mock("@/lib/query", () => ({
  qk: { tasks: { detail: (id: string) => ["tasks", "detail", id] } },
  invalidateSpaces: vi.fn(),
}));
vi.mock("@/app/detail", () => ({ useDetail: () => ({ openTask: vi.fn() }) }));

vi.mock("@/components/task/TaskView", () => ({
  TaskView: ({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) => (
    <>
      <span>{title}</span>
      <span>{subtitle}</span>
      {children}
    </>
  ),
  TaskListSkeleton: () => null,
  TaskQueryError: () => null,
}));
vi.mock("@/components/shared/EmptyState", () => ({ EmptyState: () => <span>empty</span> }));

import { WaitingView } from "./WaitingView";

const render = () => renderToStaticMarkup(<WaitingView />);
const ids = (html: string) => [...html.matchAll(/data-task-row="([^"]+)"/g)].map((m) => m[1]);

describe("the Waiting on me queue (R39)", () => {
  it("lists exactly the needs-input task among one task per state, and never one in an archived project", () => {
    expect(ids(render())).toEqual(["t-waiting"]);
  });

  it("shows the project, the agent, the wait age and the agent's question without opening the task", () => {
    const html = render();
    expect(html).toContain("Launch");
    expect(html).toContain("claude-code");
    expect(html).toContain("waiting 2h ago");
    expect(html).toContain("Which vault?");
  });

  it("offers an answer box on a Needs input row", () => {
    expect(render()).toContain("Answer &amp; resume");
  });

  it("orders two waiting tasks by how long they have waited, the older first", () => {
    data.tasks.push(
      task("t-younger", { status: "claimed", claimed_by: "codex", tags: ["needs-input"], project: "n-active" }),
    );
    bodies["t-younger"] = body([["2026-11-25T09:00:00Z", "codex", "Approve the copy?"]]);
    try {
      expect(ids(render())).toEqual(["t-waiting", "t-younger"]);
    } finally {
      data.tasks.pop();
      delete bodies["t-younger"];
    }
  });
});
