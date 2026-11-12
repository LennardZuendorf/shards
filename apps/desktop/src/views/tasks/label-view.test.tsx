/**
 * P9 — the label view lists exactly the tasks carrying that label (the second half of the row's
 * evidence; the chip itself is `task-row-labels.test.tsx`).
 *
 * `LabelView` is rendered with `renderToStaticMarkup`. Its data hooks and the list it hands the
 * rows to are stubbed (there is no DOM and no host here), and the assertions read the groups the
 * view actually passes on: which tasks survive its label/status filter, how they are grouped, and
 * what a task added in the view inherits.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Project, Task } from "@/lib/types";

const tasks: Task[] = [
  { id: "t-a", tags: ["backend"], project: null, due: "2026-11-20" },
  { id: "t-b", tags: ["backend"], project: "n-1", due: "2026-11-18" },
  { id: "t-c", tags: ["backend", "api"], project: "n-1", status: "claimed", claimed_by: "claude" },
  { id: "t-api-only", tags: ["api"], project: null },
  { id: "t-done", tags: ["backend"], project: null, status: "done" },
  { id: "t-cancelled", tags: ["backend"], project: null, status: "cancelled" },
].map((over) => ({
  type: "task" as const,
  title: `Task ${over.id}`,
  owner: "lennard",
  status: "open" as const,
  claimed_by: null,
  created: "2026-11-01T00:00:00Z",
  updated: "2026-11-01T00:00:00Z",
  priority: "normal" as const,
  blocks: [],
  blocked_by: [],
  ...over,
})) as Task[];

const projects: Project[] = [{ id: "n-1", title: "Launch", color: null, sections: [], open_count: 2 }];

vi.mock("@/lib/hooks", () => ({
  useTasks: () => ({ data: tasks, isLoading: false, error: null, refetch: vi.fn() }),
  useProjects: () => ({ data: projects, isLoading: false, error: null }),
  useMemberMap: () => new Map(),
  useMe: () => "lennard",
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return { ...actual, useRouteParams: () => ({ name: "backend" }) };
});

/** Every list the view renders, captured instead of drawn. */
const lists: { groups: { title: unknown; tasks: Task[]; addDefaults?: object }[]; storageKey?: string }[] = [];

vi.mock("@/components/task/TaskList", () => ({
  TaskList: (props: { groups: { title: unknown; tasks: Task[]; addDefaults?: object }[]; storageKey?: string }) => {
    lists.push(props);
    return null;
  },
}));

vi.mock("@/components/task/TaskView", () => ({
  TaskView: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
    <>
      <span>{title}</span>
      {children}
    </>
  ),
  TaskListSkeleton: () => null,
  TaskQueryError: () => null,
}));

vi.mock("@/components/task/TaskComposer", () => ({ TaskComposer: () => null }));
vi.mock("@/components/task/DisplayMenu", () => ({ DisplayMenu: () => null }));
vi.mock("@/components/task/FilterMenu", () => ({ FilterMenu: () => null }));
vi.mock("@/components/task/FilterChips", () => ({ FilterChips: () => null }));
vi.mock("@/components/task/LabelMenu", () => ({ LabelMenuItems: () => null, LabelDialogs: () => null }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: unknown }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

import { LabelView } from "./LabelView";

function render() {
  lists.length = 0;
  renderToStaticMarkup(<LabelView />);
  const [list] = lists;
  expect(list).toBeTruthy();
  return list;
}

describe("the label view lists a label's tasks (P9)", () => {
  it("keeps only open and claimed tasks carrying the label, in project groups with Inbox first", () => {
    const list = render();
    expect(
      list.groups.map((g) => [g.title, g.tasks.map((t) => t.id)]),
    ).toEqual([
      ["Inbox", ["t-a"]],
      ["Launch", ["t-b", "t-c"]],
    ]);
  });

  it("offers the label to a task added in any of its groups", () => {
    const list = render();
    for (const group of list.groups) expect(group.addDefaults).toMatchObject({ labels: ["backend"] });
  });

  it("persists the view's own group state under the label route", () => {
    expect(render().storageKey).toBe("label.backend");
  });
});
