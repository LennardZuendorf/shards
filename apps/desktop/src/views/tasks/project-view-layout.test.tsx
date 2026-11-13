/**
 * P15 — the list/board layout switch and the key it persists under (parity row P15).
 *
 * `ProjectView` reads the layout from `shards.project.<id>.layout` (default `list`) and renders
 * either the sectioned list or the board — by section, or by status with the completed tail. The
 * harness has no DOM, so the view is rendered with `renderToStaticMarkup`, its data hooks are
 * stubbed, and the two children it can pick between record what they were handed. The stored
 * value lives in a fake `localStorage` the real `usePersistentState` reads.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const task = (id: string, over: Record<string, unknown>) => ({
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: "lennard",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: "n-1",
    created: "2026-11-01T00:00:00Z",
    updated: "2026-11-01T00:00:00Z",
    blocks: [],
    blocked_by: [],
    ...over,
  });
  return {
    route: { id: "n-1" },
    storage: new Map<string, string>(),
    open: [task("t-a", { section: "Next", order: 1 }), task("t-b", { section: "Later", order: 2, status: "claimed" })],
    done: [task("t-old", { status: "done", completed: "2026-11-01T09:00:00Z" })],
    boards: [] as Record<string, unknown>[],
    lists: [] as Record<string, unknown>[],
    groups: [] as { value: string; onValueChange: (v: string) => void }[],
  };
});

vi.mock("@/lib/hooks", () => ({
  useTasks: (args?: { status?: string }) => ({ data: args?.status ? h.done : h.open, isLoading: false, error: null, refetch: vi.fn() }),
  useProjects: () => ({ data: [{ id: "n-1", title: "Launch", color: null, sections: [], open_count: 2 }], isLoading: false }),
  useMemberMap: () => new Map(),
  useMe: () => "lennard",
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return { ...actual, useRouteParams: () => ({ id: h.route.id }) };
});

vi.mock("@/app/header", () => ({ useHeaderTitle: () => {}, HEADER_ACTIONS_ID: "x" }));
vi.mock("@/components/task/TaskComposer", () => ({ TaskComposer: () => null }));
vi.mock("@/components/task/DisplayMenu", () => ({ DisplayMenu: () => null }));
vi.mock("@/components/task/FilterChips", () => ({ FilterChips: () => null }));
vi.mock("@/components/task/FilterMenu", () => ({ FilterMenu: () => null }));
vi.mock("@/components/task/ProjectMenu", () => ({ ProjectDialogs: () => null, ProjectMenuItems: () => null }));
vi.mock("@/components/task/project-actions", () => ({ useArchiveProject: () => vi.fn() }));
vi.mock("@/components/task/section-store", () => ({
  useSectionStore: () => ({ sections: ["Next", "Later"], setOrder: vi.fn(), ensurePersisted: vi.fn() }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: unknown }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock("@/components/ui/toggle-group", () => ({
  // The real group is an animate-ui primitive that mounts a motion projection node, which needs a
  // DOM. The switch's own binding is ProjectView's: the current value and the change handler.
  ToggleGroup: (props: { value: string; onValueChange: (v: string) => void; "aria-label": string; children: ReactNode }) => {
    h.groups.push(props);
    return (
      <div role="group" aria-label={props["aria-label"]} data-layout={props.value}>
        {props.children}
      </div>
    );
  },
  ToggleGroupItem: (props: { value: string; "aria-label": string; title: string; children: ReactNode }) => (
    <button type="button" data-value={props.value} aria-label={props["aria-label"]} title={props.title}>
      {props.children}
    </button>
  ),
}));

vi.mock("@/components/task/TaskBoard", () => ({
  TaskBoard: (props: Record<string, unknown>) => {
    h.boards.push(props);
    return <span>board</span>;
  },
}));

vi.mock("@/components/task/SectionedList", () => ({
  SectionedList: (props: Record<string, unknown>) => {
    h.lists.push(props);
    return <span>list</span>;
  },
}));

vi.mock("@/components/task/TaskView", () => ({
  TaskView: ({ children, toolbar }: { children: unknown; toolbar: unknown }) => (
    <>
      {toolbar}
      {children}
    </>
  ),
  TaskListSkeleton: () => null,
  TaskQueryError: () => null,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectView } from "./ProjectView";

/** Render the project view with `stored` in browser storage (layout keys are JSON-encoded). */
function render(stored: Record<string, string> = {}) {
  h.boards.length = 0;
  h.lists.length = 0;
  h.groups.length = 0;
  h.storage.clear();
  for (const [k, v] of Object.entries(stored)) h.storage.set(k, JSON.stringify(v));
  (globalThis as unknown as { window: unknown }).window = {
    location: { hash: "" },
    localStorage: {
      getItem: (k: string) => h.storage.get(k) ?? null,
      setItem: (k: string, v: string) => void h.storage.set(k, v),
      removeItem: (k: string) => void h.storage.delete(k),
      clear: () => h.storage.clear(),
      key: () => null,
      length: 0,
    },
  };
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <ProjectView />
    </TooltipProvider>,
  );
  return { html, board: h.boards.at(-1), list: h.lists.at(-1), switch: h.groups.at(-1) };
}

const LAYOUT_KEY = "shards.project.n-1.layout";

describe("project layout switch (P15)", () => {
  it("renders the list by default, with the layout switch offering list, board and status", () => {
    const { html, board, list, switch: control } = render();
    expect(list).toBeTruthy();
    expect(board).toBeUndefined();
    expect(list?.project).toBe("n-1");
    expect(control?.value).toBe("list");
    expect(html).toContain('aria-label="Layout"');
    expect([...html.matchAll(/data-value="([^"]+)"/g)].map((m) => m[1])).toEqual(["list", "board-section", "board-status"]);
    for (const label of ["List", "Board by section", "Board by status"]) expect(html).toContain(`aria-label="${label}"`);
  });

  it("shows the stored layout as the switch's current value", () => {
    expect(render({ [LAYOUT_KEY]: "board-section" }).switch?.value).toBe("board-section");
    expect(render({ [LAYOUT_KEY]: "board-status" }).switch?.value).toBe("board-status");
  });

  it("renders the section board when the stored layout is board-section", () => {
    const { board, list } = render({ [LAYOUT_KEY]: "board-section" });
    expect(list).toBeUndefined();
    expect(board?.mode).toBe("section");
    // Completed tasks stay off until the Completed toggle is on.
    expect(board?.completed).toEqual([]);
  });

  it("renders the status board with the completed tail when the stored layout is board-status", () => {
    const { board } = render({ [LAYOUT_KEY]: "board-status" });
    expect(board?.mode).toBe("status");
    const completed = (board?.completed ?? []) as { id: string }[];
    expect(completed.map((t) => t.id)).toEqual(["t-old"]);
  });

  it("keys the preference per project, so another project's layout does not leak in", () => {
    const { board, list } = render({ "shards.project.n-2.layout": "board-status" });
    expect(list).toBeTruthy();
    expect(board).toBeUndefined();
  });
});
