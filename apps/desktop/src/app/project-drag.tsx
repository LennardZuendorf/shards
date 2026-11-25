/**
 * The sidebar's project reorder by drag: a `DndContext` + `SortableContext` around the project
 * rows, and the drop path that turns a drop into `order` writes on the project notes.
 *
 * The row chrome stays in `Sidebar` (it is passed in through `children`) so this file owns only
 * the interaction — which is exactly what the drop-path test mounts. `useProjectSortable` is the
 * one binding a row needs; `Sidebar`'s `ProjectRow` and the test both use it.
 */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { KEYBOARD_DRAG } from "@/components/task/selection";
import type { OrderWrite } from "@/components/task/model";
import type { Project } from "@/lib/types";
import { planProjectOrder } from "./project-order";

/** Everything a project row needs to be a sortable: put `ref`, `style` and `props` on its `li`. */
export function useProjectSortable(id: string) {
  return useSortable({ id });
}

export function ProjectDragList({
  projects,
  onReorder,
  children,
}: {
  /** The rows as shown, in shown order (see `orderProjects`). */
  projects: Project[];
  /** The `order` writes a drop produced; `[]` when the drop changed nothing. */
  onReorder: (writes: OrderWrite[]) => void;
  /**
   * The `<ul>` holding the rows. It must sit *inside* this component but *outside* nothing:
   * `DndContext` renders a `role="status"` live region, and a `<ul>` may not directly contain
   * one, so the context wraps the list rather than the list wrapping the context.
   */
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, KEYBOARD_DRAG),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const to = ids.indexOf(String(over.id));
    if (to < 0 || !ids.includes(String(active.id))) return;
    onReorder(planProjectOrder(projects, String(active.id), to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
