// @vitest-environment jsdom
/**
 * The sidebar's project reorder (`ProjectDragList`, src/app/project-drag.tsx) driven by a real
 * dnd-kit keyboard drag in jsdom.
 *
 * `ProjectDragList` owns only the interaction: a `DndContext` + `SortableContext` and the drop
 * path that turns a drop into `order` writes. The row chrome comes from `Sidebar` through the
 * render prop, so this test supplies the same binding the sidebar uses (`useProjectSortable` on
 * an `<li data-project-row>`) and records what `onReorder` is handed.
 *
 * jsdom has no layout (`getBoundingClientRect` returns zeros), so `stubRects()` gives each
 * sortable `<li>` a 40px row: without it the keyboard sensor cannot move and no drop happens.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CSS } from "@dnd-kit/utilities";
import type { OrderWrite } from "@/components/task/model";
import type { Project } from "@/lib/types";

const box = vi.hoisted(() => ({
  trail: [] as string[],
}));

// Records the drag events `ProjectDragList` hands to dnd-kit while keeping the real DndContext.
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
  return { ...actual, DndContext: Recorder };
});

import { ProjectDragList, useProjectSortable } from "./project-drag";
import { orderProjects } from "./project-order";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW_H = 40;
const ORIGINAL_RECT = Element.prototype.getBoundingClientRect;

function stubRects(order: readonly string[]) {
  (Element.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = function (
    this: Element,
  ) {
    const el = this as HTMLElement;
    const id =
      el.dataset?.projectRow ?? el.querySelector?.("[data-project-row]")?.getAttribute("data-project-row") ?? undefined;
    const i = id ? order.indexOf(id) : 0;
    const top = i * ROW_H;
    const height = id ? ROW_H : order.length * ROW_H;
    return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON() {} } as DOMRect;
  };
}

const project = (id: string, title: string, order: number): Project => ({
  id,
  title,
  sections: [],
  open_count: 0,
  order,
});

const PROJECTS = [
  project("p1", "Home", 1024),
  project("p2", "Work", 2048),
  project("p3", "Garden", 3072),
  project("p4", "Art", 4096),
];
const ORDER = PROJECTS.map((p) => p.id);

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let onReorder: Mock<(writes: OrderWrite[]) => void>;

function Row({ p }: { p: Project }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useProjectSortable(p.id);
  return (
    <li
      ref={setNodeRef}
      data-project-row={p.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {p.title}
    </li>
  );
}

async function mount(projects: Project[], order: readonly string[] = ORDER) {
  stubRects(order);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ul>
        <ProjectDragList projects={projects} onReorder={onReorder}>
          {(p) => <Row key={p.id} p={p} />}
        </ProjectDragList>
      </ul>,
    ),
  );
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

async function keyboardDrag(from: string, arrow: "ArrowUp" | "ArrowDown", times: number) {
  const row = document.querySelector(`[data-project-row="${from}"]`) as HTMLElement | null;
  expect(row, `row ${from} is rendered`).not.toBeNull();
  await act(async () => key(row as HTMLElement, "Space", { shiftKey: true }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20)); // the sensor attaches its document listener in a setTimeout
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
  [...document.querySelectorAll("[data-project-row]")]
    .map((e) => (e as HTMLElement).dataset.projectRow)
    .filter((id): id is string => !!id);

/** What `Sidebar` does with the writes: the host stores `order` and the list re-sorts. */
const applyWrites = (projects: Project[], writes: { id: string; order: number }[]) =>
  projects.map((p) => {
    const w = writes.find((x) => x.id === p.id);
    return w ? { ...p, order: w.order } : p;
  });

beforeEach(() => {
  box.trail = [];
  onReorder = vi.fn<(writes: OrderWrite[]) => void>();
});

afterEach(async () => {
  await unmount();
  Element.prototype.getBoundingClientRect = ORIGINAL_RECT;
});

describe("ProjectDragList drop path (jsdom, real dnd-kit keyboard drag)", () => {
  it("dragging the third row to the first writes one midpoint `{order: 0}` and renders it first", async () => {
    await mount(PROJECTS);
    expect(renderedOrder()).toEqual(["p1", "p2", "p3", "p4"]);

    await keyboardDrag("p3", "ArrowUp", 2);

    expect(box.trail).toEqual(["start:p3", "over:p3", "over:p2", "over:p1", "end:p1"]);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([{ id: "p3", order: 0 }]);

    const next = orderProjects(applyWrites(PROJECTS, onReorder.mock.calls[0][0]));
    expect(next.map((p) => p.id)).toEqual(["p3", "p1", "p2", "p4"]);
    await unmount();
    await mount(next, next.map((p) => p.id));
    expect(renderedOrder()).toEqual(["p3", "p1", "p2", "p4"]);
  });

  it("dragging the first row to the third writes the real midpoint between p3 and p4", async () => {
    await mount(PROJECTS);

    await keyboardDrag("p1", "ArrowDown", 2);

    expect(box.trail).toEqual(["start:p1", "over:p1", "over:p2", "over:p3", "end:p3"]);
    expect(onReorder).toHaveBeenCalledTimes(1);
    // planProjectOrder(shown, "p1", 2): rest is [p2 2048, p3 3072, p4 4096], so the midpoint
    // between p3 and p4 is 3072 + (4096 - 3072) / 2 — not the 4608 a "past the end" drop gives.
    expect(onReorder).toHaveBeenCalledWith([{ id: "p1", order: 3584 }]);

    const next = orderProjects(applyWrites(PROJECTS, onReorder.mock.calls[0][0]));
    expect(next.map((p) => p.id)).toEqual(["p2", "p3", "p1", "p4"]);
    await unmount();
    await mount(next, next.map((p) => p.id));
    expect(renderedOrder()).toEqual(["p2", "p3", "p1", "p4"]);
  });

  it("both drops feed back through orderProjects: the rendered order is the host's order", async () => {
    await mount(PROJECTS);

    await keyboardDrag("p3", "ArrowUp", 2);
    let next = orderProjects(applyWrites(PROJECTS, onReorder.mock.calls[0][0]));
    expect(renderedOrder()).not.toEqual(next.map((p) => p.id)); // props unchanged until remount
    await unmount();
    await mount(next, next.map((p) => p.id));
    expect(renderedOrder()).toEqual(orderProjects(next).map((p) => p.id));
    expect(renderedOrder()).toEqual(["p3", "p1", "p2", "p4"]);

    // The same list again, now numbered p3=0: p3 down two places lands between p2 and p4.
    await keyboardDrag("p3", "ArrowDown", 2);
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onReorder.mock.calls[1][0]).toEqual([{ id: "p3", order: 3072 }]);
    next = orderProjects(applyWrites(next, onReorder.mock.calls[1][0]));
    await unmount();
    await mount(next, next.map((p) => p.id));
    expect(renderedOrder()).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
