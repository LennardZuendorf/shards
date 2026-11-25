/**
 * The deadline chip **on a task row** (desktop-app R9, P12): a row carrying both dates shows the
 * due chip and a separate, outlined deadline chip, so "due Friday, must ship Tuesday" reads at a
 * glance. A row whose deadline is today but whose due date is not still shows the deadline; the
 * chip must never stand in for the due date.
 *
 * Rendered with `renderToStaticMarkup`; the stores around `TaskRow` are stubbed exactly as in
 * `task-row-labels.test.tsx`, so the chips, their order and their classes are the real components.
 */
import { addDays, addYears } from "date-fns";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { relativeDayLabel, toDateKey } from "@/lib/dates";
import type { Task } from "@/lib/types";

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

const rowHtml = (t: Task) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <TaskRow task={t} />
    </TooltipProvider>,
  );

/** The markup of the chip that carries `marker` as its title (up to the next titled chip). */
function chip(html: string, marker: string): string | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const next = html.indexOf('<span title="', at + marker.length);
  return html.slice(at, next < 0 ? at + 700 : next);
}

const NOW = new Date();
const TODAY = toDateKey(NOW);
const TOMORROW = toDateKey(addDays(NOW, 1));
const NEXT_WEEK = toDateKey(addDays(NOW, 7));
const YESTERDAY = toDateKey(addDays(NOW, -1));

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { location: { hash: "" } };
});

describe("deadline chip on a task row (P12)", () => {
  it("renders both dates: an outlined deadline chip after the due chip", () => {
    const html = rowHtml(task({ due: NEXT_WEEK, deadline: TODAY }));
    const due = chip(html, `title="${NEXT_WEEK}"`);
    const deadline = chip(html, `title="Deadline ${TODAY}"`);

    expect(due).toContain("lucide-calendar");
    expect(deadline).toContain("lucide-target");
    // Visually distinct: the deadline chip is an outline (ring), the due chip is bare text.
    expect(deadline).toMatch(/ring-1/);
    expect(due).not.toMatch(/ring-1/);
    expect(html.indexOf(`title="${NEXT_WEEK}"`)).toBeLessThan(html.indexOf(`title="Deadline ${TODAY}"`));
  });

  it("reads the deadline on a deadline-today row", () => {
    const deadline = chip(rowHtml(task({ due: NEXT_WEEK, deadline: TODAY })), `title="Deadline ${TODAY}"`);
    expect(deadline).toContain(">Today<");
  });

  it("keeps the deadline separate from a due-today row: the deadline chip reads next week, not today", () => {
    const html = rowHtml(task({ due: TODAY, deadline: NEXT_WEEK }));
    const due = chip(html, `title="${TODAY}"`);
    const deadline = chip(html, `title="Deadline ${NEXT_WEEK}"`);

    expect(due).toContain(">Today<");
    expect(deadline).toContain(`>${relativeDayLabel(new Date(`${NEXT_WEEK}T00:00`), NOW)}<`);
    expect(deadline).not.toContain(">Today<");
  });

  it("turns the deadline chip danger-red once the deadline has passed", () => {
    const deadline = chip(rowHtml(task({ due: NEXT_WEEK, deadline: YESTERDAY })), `title="Deadline ${YESTERDAY}"`);
    expect(deadline).toContain("text-due-overdue");
    expect(deadline).toContain("lucide-target");
  });

  it("warns (semantic.warning) within two days, not before", () => {
    expect(chip(rowHtml(task({ deadline: TOMORROW })), `title="Deadline ${TOMORROW}"`)).toContain("text-warning");
    const later = toDateKey(addYears(NOW, 1));
    const muted = chip(rowHtml(task({ deadline: later })), `title="Deadline ${later}"`);
    expect(muted).toContain("text-muted-foreground");
    expect(muted).not.toContain("text-warning");
    expect(muted).not.toContain("text-due-overdue");
  });

  it("shows no deadline chip when the task has no deadline", () => {
    const html = rowHtml(task({ due: TODAY }));
    expect(html).not.toContain('title="Deadline');
    expect(chip(html, `title="${TODAY}"`)).toContain("lucide-calendar");
  });
});
