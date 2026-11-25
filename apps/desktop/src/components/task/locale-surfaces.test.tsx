/**
 * R38 — one date, three surfaces: the due chip, the task row that carries it and the detail
 * pane's own date widgets (its deadline chip and the timestamp footer) all read the same order.
 *
 * The row is rendered with `renderToStaticMarkup` and only the stores around it are stubbed, as
 * in `task-row-labels.test.tsx`; the detail pane's field widgets are rendered directly.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";
import { resetLocalePrefs, setDateOrder, setHourCycle } from "@/lib/locale";

vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
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
        setDeadline: vi.fn(),
      }) as never,
  };
});

vi.mock("./TaskMenu", () => ({ TaskMenuItems: () => null, default: () => null }));
vi.mock("./pickers", () => ({
  LabelPickerContent: () => null,
  PriorityItems: () => null,
  ProjectPickerContent: () => null,
  ScheduleContent: () => null,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { TaskRow } from "@/components/task/TaskRow";

const NOW = new Date(2026, 10, 15); // 2026-11-15: far enough that the chip shows the date itself.

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

const rowHtml = (t: Task) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <TaskRow task={t} />
    </TooltipProvider>,
  );

beforeEach(() => {
  resetLocalePrefs();
  (globalThis as { window?: unknown }).window = { location: { hash: "" } };
});

describe("2026-12-03 renders in the setting's order everywhere (R38)", () => {
  it("month first: 12/3 in the chip, the row and the detail's deadline", () => {
    setDateOrder("mdy");
    expect(renderToStaticMarkup(<DueChip due="2026-12-03" now={NOW} />)).toContain("12/3");
    expect(rowHtml(task({ due: "2026-12-03" }))).toContain("12/3");
    expect(renderToStaticMarkup(<DeadlineChip deadline="2026-12-03" now={NOW} />)).toContain("12/3");
  });

  it("day first: 3/12 in the chip, the row and the detail's deadline", () => {
    setDateOrder("dmy");
    expect(renderToStaticMarkup(<DueChip due="2026-12-03" now={NOW} />)).toContain("3/12");
    expect(rowHtml(task({ due: "2026-12-03" }))).toContain("3/12");
    expect(renderToStaticMarkup(<DeadlineChip deadline="2026-12-03" now={NOW} />)).toContain("3/12");
  });

  it("a timed task carries the clock setting into the row's chip: 2:30 PM and 14:30", () => {
    setHourCycle("h12");
    expect(rowHtml(task({ due: "2026-11-15T14:30" }))).toContain("2:30 PM");
    setHourCycle("h24");
    const html = rowHtml(task({ due: "2026-11-15T14:30" }));
    expect(html).toContain("14:30");
    expect(html).not.toContain("2:30 PM");
  });
});
