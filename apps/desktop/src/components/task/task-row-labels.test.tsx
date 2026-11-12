/**
 * P9 — labels are shown **on a task row** (the first half of the row's evidence).
 *
 * `TaskRow` renders one `LabelChip` per `task.tags` entry. The harness has no DOM, so the row is
 * rendered with `renderToStaticMarkup` and only the state stores around it are stubbed (selection,
 * detail pane, member map, task actions, menus) — the chips, their order and their click handler
 * are the real component.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    // Selection/cursor state only decides highlight classes here.
    completeAnimated: vi.fn(),
    select: vi.fn(),
    startEditing: vi.fn(),
    openRowPicker: vi.fn(),
    clearMulti: vi.fn(),
    rangeTo: vi.fn(),
    toggleMulti: vi.fn(),
    isKeyboardDrag: () => false,
    useRegisterRow: () => {},
    useIsCompleting: () => false,
    useIsEditing: () => false,
    useHasSelection: () => false,
    useIsSelected: () => false,
    useRowPicker: () => null,
    useIsMultiSelected: () => false,
  };
});

vi.mock("@/app/detail", () => ({
  openTask: vi.fn(),
  closeDetail: vi.fn(),
  useDetail: () => ({ isOpen: () => false, target: null }),
}));

vi.mock("@/lib/hooks", () => ({
  useMemberMap: () => new Map(),
  useMe: () => "lennard",
  useProjects: () => ({ data: [] }),
  useTasks: () => ({ data: [] }),
}));

vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return { ...actual, useActingMe: () => "lennard" };
});

vi.mock("./actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actions")>();
  return {
    ...actual,
    useTaskActions: () =>
      ({
        me: "lennard",
        rename: vi.fn(),
        complete: vi.fn(),
        reopen: vi.fn(),
        schedule: vi.fn(),
        setPriority: vi.fn(),
        setRecur: vi.fn(),
        moveTo: vi.fn(),
        setLabels: vi.fn(),
      }) as never,
  };
});

// The row's menus and pickers are separate surfaces; this file is about its chips.
vi.mock("./TaskMenu", () => ({ TaskMenuItems: () => null, default: () => null }));
vi.mock("./pickers", () => ({
  LabelPickerContent: () => null,
  PriorityItems: () => null,
  ProjectPickerContent: () => null,
  ScheduleContent: () => null,
}));

import { paths } from "@/lib/router";
import { LabelChip } from "@/components/shared/LabelChip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskRow } from "./TaskRow";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t-1",
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

/** The text of every label chip on the row, in render order. */
const chipNames = (html: string) =>
  [...html.matchAll(/role="link"[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span class="truncate">([^<]+)<\/span>/g)].map((m) => m[1]);

const rowHtml = (t: Task) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <TaskRow task={t} />
    </TooltipProvider>,
  );

beforeEach(() => {
  // `navigate` (the chip's click handler) writes the hash router's location.
  (globalThis as { window?: unknown }).window = { location: { hash: "" } };
});

describe("labels on a task row (P9)", () => {
  it("shows one label chip per tag, in the task's own tag order", () => {
    expect(chipNames(rowHtml(task({ tags: ["backend", "needs-input"] })))).toEqual(["backend", "needs-input"]);
  });

  it("shows no label chip on a task without tags", () => {
    expect(chipNames(rowHtml(task()))).toEqual([]);
    expect(rowHtml(task())).not.toContain('role="link"');
  });

  it("keeps the chips for a done task, so its labels stay readable on the row", () => {
    expect(chipNames(rowHtml(task({ tags: ["ops"], status: "done", completed: "2026-11-10T09:00:00Z" })))).toEqual(["ops"]);
  });

  it("opens the label view when a chip is clicked", () => {
    const el = LabelChip({ name: "needs-input" }) as { props: { onClick: (e: { stopPropagation(): void }) => void } };
    const stopPropagation = vi.fn();
    el.props.onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
    expect((globalThis as unknown as { window: { location: { hash: string } } }).window.location.hash).toBe(`#${paths.label("needs-input")}`);
  });
});
