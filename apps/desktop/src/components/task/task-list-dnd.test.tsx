// @vitest-environment jsdom
/**
 * The real `TaskList` drop path (TaskList.tsx:204-257), driven by a real dnd-kit keyboard drag.
 *
 * Every other `.tsx` test in this repo renders with `renderToStaticMarkup`; that cannot advance a
 * drag (no DOM, no effects, no events), so `onDragEnd` never runs. This file mounts the real
 * component with `createRoot` in jsdom and drives the `KeyboardSensor` (Shift+Space, arrows,
 * Space) at the row, so the persisted `order` writes and the re-render that follows are real.
 *
 * Geometry: jsdom's `getBoundingClientRect` returns zeros. With zero rects the 3 → 1 drag still
 * "passes" for the wrong reason while the 1 → 3 drag writes nothing, so `stubRects()` gives every
 * sortable wrapper a 40px row keyed on its `data-task-row`, and the 1 → 3 case is the guard that
 * only passes when the coordinates really move.
 *
 * `DragOverlay` is the one dnd-kit piece that cannot run here: it registers its own node as the
 * drag's measuring rect, and a jsdom node has no layout, so it hijacks dnd-kit's active rect and
 * every arrow step lands on the wrong row. It is pure presentation (a floating copy of the row);
 * it is rendered as a plain container, and everything that decides the drop — sensors, collision
 * detection, `TaskList`'s own onDragStart/onDragOver/onDragEnd — is the real code.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

const box = vi.hoisted(() => ({
  writes: [] as [string, Record<string, unknown>][],
  trail: [] as string[],
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    taskUpdate: vi.fn(async (id: string, args: Record<string, unknown>) => {
      box.writes.push([id, args]);
      return { id } as unknown as Task;
    }),
    taskFinish: vi.fn(async () => ({ id: "" }) as unknown as Task),
    taskCancel: vi.fn(async () => ({ id: "" }) as unknown as Task),
    taskGet: vi.fn(async () => ({ id: "" }) as unknown as Task),
  };
});

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });
  return { toast, Toaster: () => null };
});

vi.mock("@/lib/hooks", () => ({
  useMe: () => "lennard",
  useMemberMap: () => new Map(),
  useTasks: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
}));

vi.mock("@/app/detail", () => ({
  openTask: vi.fn(),
  closeDetail: vi.fn(),
  useDetail: () => ({ isOpen: () => false, target: null }),
}));

vi.mock("./TaskMenu", () => ({ TaskMenuItems: () => null, default: () => null }));
vi.mock("./pickers", () => ({
  LabelPickerContent: () => null,
  PriorityItems: () => null,
  ProjectPickerContent: () => null,
  ScheduleContent: () => null,
}));
vi.mock("./TaskComposer", () => ({ TaskComposer: () => null }));

// Records the drag events `TaskList` hands to dnd-kit while keeping the real DndContext.
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const React = await import("react");
  const Recorder = (props: Record<string, unknown>) =>
    React.createElement(actual.DndContext as never, {
      ...props,
      onDragStart: (e: { active: { id: unknown } }) => {
        box.trail.push(`start:${String(e.active.id)}`);
        (props.onDragStart as ((ev: unknown) => void) | undefined)?.(e);
      },
      onDragOver: (e: { over: { id: unknown } | null }) => {
        box.trail.push(`over:${e.over ? String(e.over.id) : "none"}`);
        (props.onDragOver as ((ev: unknown) => void) | undefined)?.(e);
      },
      onDragEnd: (e: { over: { id: unknown } | null }) => {
        box.trail.push(`end:${e.over ? String(e.over.id) : "none"}`);
        (props.onDragEnd as ((ev: unknown) => void) | undefined)?.(e);
      },
    });
  const Overlay = (props: { children?: unknown }) => React.createElement("div", null, props.children as never);
  return { ...actual, DndContext: Recorder, DragOverlay: Overlay };
});

import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskList } from "./TaskList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW_H = 40;
const ORIGINAL_RECT = Element.prototype.getBoundingClientRect;

/** jsdom has no layout: give each sortable wrapper a 40px row, in the order given. */
function stubRects(order: readonly string[]) {
  (Element.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = function (
    this: Element,
  ) {
    const el = this as HTMLElement;
    // The droppable is SortableNode's wrapper; `data-task-row` is on TaskRow's div inside it.
    const id =
      el.dataset?.taskRow ?? el.querySelector?.("[data-task-row]")?.getAttribute("data-task-row") ?? undefined;
    const i = id ? order.indexOf(id) : 0;
    const top = i * ROW_H;
    const height = id ? ROW_H : order.length * ROW_H;
    return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON() {} } as DOMRect;
  };
}

const task = (id: string, order: number): Task => ({
  id,
  type: "task",
  title: id,
  tags: [],
  owner: "lennard",
  created: "2026-11-01T00:00:00Z",
  updated: "2026-11-01T00:00:00Z",
  status: "open",
  priority: "normal",
  claimed_by: null,
  project: null,
  blocks: [],
  blocked_by: [],
  order,
});

const TASKS = [task("t1", 1024), task("t2", 2048), task("t3", 3072), task("t4", 4096)];
const ORDER = TASKS.map((t) => t.id);

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function Harness({ tasks }: { tasks: Task[] }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TaskList groups={[{ key: "inbox", title: "Inbox", tasks, reorder: true }]} storageKey="dnd-test" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

async function mount(tasks: Task[], order: readonly string[] = ORDER) {
  stubRects(order);
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness tasks={tasks} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function unmount() {
  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
}

const key = (target: EventTarget, code: string, extra: KeyboardEventInit = {}) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      code,
      key: code === "Space" ? " " : code,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
};

/**
 * Shift+Space on the row, then the arrow keys on `document` (KeyboardSensor attaches its own
 * document listener in a setTimeout, hence the await), then Space to drop.
 */
async function keyboardDrag(from: string, arrow: "ArrowUp" | "ArrowDown", times: number) {
  const row = document.querySelector(`[data-task-row="${from}"]`) as HTMLElement | null;
  expect(row, `row ${from} is rendered`).not.toBeNull();
  await act(async () => key(row as HTMLElement, "Space", { shiftKey: true }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      key(document, arrow);
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  await act(async () => {
    key(document, "Space");
    await new Promise((r) => setTimeout(r, 40));
  });
}

const renderedOrder = () =>
  [...document.querySelectorAll("[data-task-row]")]
    .map((e) => (e as HTMLElement).dataset.taskRow)
    .filter((id): id is string => !!id);

/** Apply the recorded `{order}` writes to the fixtures, the way the host would. */
const applyWrites = (tasks: Task[], writes: [string, Record<string, unknown>][]) =>
  tasks.map((t) => {
    const w = writes.find(([id]) => id === t.id);
    return w && typeof w[1].order === "number" ? { ...t, order: w[1].order as number } : t;
  });

beforeEach(() => {
  box.writes = [];
  box.trail = [];
});

afterEach(async () => {
  await unmount();
  Element.prototype.getBoundingClientRect = ORIGINAL_RECT;
  window.localStorage.clear();
});

describe("TaskList drop path (jsdom, real dnd-kit keyboard drag)", () => {
  it("row 3 → row 1: exactly one write `{order: 0}`, over trail t3/t2/t1, renders [t3, t1, t2, t4]", async () => {
    await mount(TASKS);
    expect(renderedOrder()).toEqual(["t1", "t2", "t3", "t4"]);

    await keyboardDrag("t3", "ArrowUp", 2);

    // The coordinate getter really walked up two rows; with jsdom's zero rects it never leaves t3.
    expect(box.trail).toEqual(["start:t3", "over:t3", "over:t2", "over:t1", "end:t1"]);
    // One midpoint write, not a renumber of the group (which would write all four rows).
    expect(box.writes).toEqual([["t3", { order: 0 }]]);

    // Feed the write back the way the host would: the list renders the new order.
    const next = applyWrites(TASKS, box.writes);
    await unmount();
    await mount(next, ["t3", "t1", "t2", "t4"]);
    expect(renderedOrder()).toEqual(["t3", "t1", "t2", "t4"]);
  });

  it("row 1 → row 3 (geometry guard): exactly one write `{order: 3584}`, renders [t2, t3, t1, t4]", async () => {
    await mount(TASKS);

    await keyboardDrag("t1", "ArrowDown", 2);

    // With jsdom's zero rects this drag produces no write at all, so the guard fails loudly.
    expect(box.trail).toEqual(["start:t1", "over:t1", "over:t2", "over:t3", "end:t3"]);
    expect(box.writes).toEqual([["t1", { order: 3584 }]]);

    const next = applyWrites(TASKS, box.writes);
    await unmount();
    await mount(next, ["t2", "t3", "t1", "t4"]);
    expect(renderedOrder()).toEqual(["t2", "t3", "t1", "t4"]);
  });

  it("a drop back onto itself writes nothing", async () => {
    await mount(TASKS);
    await keyboardDrag("t2", "ArrowUp", 0);
    expect(box.trail).toEqual(["start:t2", "over:t2", "end:t2"]);
    expect(box.writes).toEqual([]);
    expect(renderedOrder()).toEqual(["t1", "t2", "t3", "t4"]);
  });
});
