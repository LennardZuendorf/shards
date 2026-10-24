/**
 * Grouped task list: collapsible group headers, subtasks nested under parents (collapsible),
 * an inline "Add task" row per group, and drag & drop (dnd-kit) that reorders within a group
 * (writing `order` midpoints) and moves between groups (each group says what a drop means,
 * e.g. `{section}` in a project or `{due}` in Upcoming).
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRightIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { taskUpdate, type TaskUpdateArgs } from "@/lib/api";
import { toWire, undoFor } from "@/lib/patch";
import { toastWithUndo } from "@/lib/query";
import { toast } from "sonner";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskFilters } from "@/lib/ui-contract";
import { filtersActive } from "@/lib/view-options";
import { usePatchMany } from "./actions";
import { FilteredToZero } from "./FilterChips";
import { useOpenIds, useOpenTaskMap, usePersistentSet, useProjectMap } from "./hooks";
import { buildTree, compareManual, countTopLevel, descendantCount, ORDER_STEP, openBlockers, planReorder, type TaskNode } from "./model";
import { KEYBOARD_DRAG, registerPlaces, setKeyboardDrag, type RowPlace } from "./selection";
import { TaskComposer, type ComposerDefaults } from "./TaskComposer";
import { TaskRow, type TaskRowProps } from "./TaskRow";

export interface TaskGroupSpec {
  key: string;
  /** Header; omit for a headerless group (e.g. the unsectioned head of a project). */
  title?: ReactNode;
  /** Right side of the header (menus, "Reschedule"). */
  actions?: ReactNode;
  tasks: Task[];
  /** Root ordering (default manual). */
  compare?: (a: Task, b: Task) => number;
  /** Inline composer defaults; `null`/absent hides the composer. */
  addDefaults?: ComposerDefaults | null;
  addLabel?: string;
  /** Dragging within the group writes `order`. */
  reorder?: boolean;
  /** What dropping a task from another group into this one writes (null = refuse). */
  dropArgs?: (t: Task) => TaskUpdateArgs | null;
  /** Collapsible header (default true when there is a title). */
  collapsible?: boolean;
  /** Start collapsed; the viewer's toggle is still remembered. */
  defaultCollapsed?: boolean;
  /** Shown under the header when the group has no tasks. */
  empty?: ReactNode;
  /** Muted header tone (e.g. empty day). */
  dim?: boolean;
  /** Header accent (e.g. overdue red). */
  tone?: "default" | "danger";
  /** Plain-text name for screen readers when `title` is not a string. */
  label?: string;
  /** View options leave this group as delivered, at the end (delegated, completed). */
  fixed?: boolean;
  /** Shown only while dragging, as a "Move to <group>" drop zone (empty custom groups). */
  dropZoneOnly?: boolean;
}

export interface TaskListProps {
  groups: TaskGroupSpec[];
  /** localStorage key prefix for collapsed groups/parents. */
  storageKey: string;
  rowProps?: Pick<TaskRowProps, "showProject" | "showSection" | "showDue" | "renderTitle" | "density">;
  /** Disable drag & drop entirely (search results). */
  static?: boolean;
  /** Runs right before a drop writes its patch (sectioned lists pin their section order). */
  onBeforeDrop?: () => void;
  /** A Display sort is on: reorder shortcuts explain that manual order is off. */
  sorted?: boolean;
  /** Active filters and how to clear them: when they leave no row, the R28 filtered-to-zero state shows. */
  filters?: { value: TaskFilters; onChange: (f: TaskFilters) => void };
  className?: string;
}

const GROUP_PREFIX = "group:";

interface Built {
  spec: TaskGroupSpec;
  roots: TaskNode[];
}

export function TaskList({ groups, storageKey, rowProps, static: isStatic, className, onBeforeDrop, sorted, filters }: TaskListProps) {
  const [collapsedGroups, toggleGroup] = usePersistentSet(`shards.collapsed.${storageKey}`);
  const [collapsedParents, toggleParent] = usePersistentSet("shards.collapsed.parents");
  const openIds = useOpenIds();
  const openMap = useOpenTaskMap();
  const projects = useProjectMap();
  const patchMany = usePatchMany();

  const built: Built[] = useMemo(
    () => groups.map((spec) => ({ spec, roots: buildTree(spec.tasks, spec.compare ?? compareManual) })),
    [groups],
  );
  const nodeById = useMemo(() => {
    const m = new Map<string, TaskNode>();
    const walk = (ns: TaskNode[]) =>
      ns.forEach((n) => {
        m.set(n.task.id, n);
        walk(n.children);
      });
    built.forEach((b) => walk(b.roots));
    return m;
  }, [built]);
  const base = useMemo(() => Object.fromEntries(built.map((b) => [b.spec.key, b.roots.map((n) => n.task.id)])), [built]);

  const [drag, setDrag] = useState<{ active: string; from: string; containers: Record<string, string[]> } | null>(null);
  const containers = drag?.containers ?? base;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, KEYBOARD_DRAG));

  // Every shown row's place, for the keyboard structure edits in TaskView (⌘⇧↑/↓, Tab, ⇧Tab).
  useEffect(() => {
    const entries: [string, RowPlace][] = [];
    for (const { spec, roots } of built) {
      const manual = !!spec.reorder && !isStatic;
      const walk = (nodes: TaskNode[], parent: Task | null) => {
        const siblings = nodes.map((n) => n.task);
        for (const n of nodes) {
          entries.push([n.task.id, { siblings, manual, sorted, parent, children: n.children.map((c) => c.task), beforeWrite: onBeforeDrop }]);
          walk(n.children, n.task);
        }
      };
      walk(roots, null);
    }
    return registerPlaces(entries);
  }, [built, isStatic, onBeforeDrop, sorted]);

  const findContainer = useCallback(
    (id: string, within: Record<string, string[]>) => {
      if (id.startsWith(GROUP_PREFIX)) return id.slice(GROUP_PREFIX.length);
      return Object.keys(within).find((k) => within[k].includes(id)) ?? null;
    },
    [],
  );
  const specOf = useCallback((key: string) => built.find((b) => b.spec.key === key)?.spec ?? null, [built]);

  const collision: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    const taskHit = hits.find((h) => !String(h.id).startsWith(GROUP_PREFIX));
    if (taskHit) return [taskHit];
    if (hits.length) {
      // inside a group but between rows: closest row of that group, else the group itself
      const inner = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith(GROUP_PREFIX)),
      });
      return inner.length ? [inner[0], ...hits] : hits;
    }
    return closestCenter(args);
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    setKeyboardDrag(e.activatorEvent instanceof KeyboardEvent);
    const id = String(e.active.id);
    const from = findContainer(id, base);
    if (from) setDrag({ active: id, from, containers: base });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!drag || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const src = findContainer(activeId, drag.containers);
    const dst = findContainer(overId, drag.containers);
    if (!src || !dst || src === dst) return;
    const dspec = specOf(dst);
    if (!dspec) return;
    const task = nodeById.get(activeId)?.task;
    if (dst !== drag.from && (!task || !dspec.dropArgs || dspec.dropArgs(task) === null)) return;
    const target = drag.containers[dst];
    const overIndex = target.indexOf(overId);
    const below =
      over.rect && active.rect.current.translated ? active.rect.current.translated.top > over.rect.top + over.rect.height / 2 : false;
    const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
    setDrag({
      ...drag,
      containers: {
        ...drag.containers,
        [src]: drag.containers[src].filter((x) => x !== activeId),
        [dst]: [...target.slice(0, index), activeId, ...target.slice(index)],
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setKeyboardDrag(false);
    const state = drag;
    setDrag(null);
    if (!state || !over) return;
    const activeId = String(active.id);
    const task = nodeById.get(activeId)?.task;
    if (!task) return;
    const dst = findContainer(activeId, state.containers);
    if (!dst) return;
    const ids = [...state.containers[dst]];
    // final position within the destination
    const overId = String(over.id);
    if (!overId.startsWith(GROUP_PREFIX) && ids.includes(overId) && overId !== activeId) {
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      ids.splice(from, 1);
      ids.splice(to, 0, activeId);
    }
    const spec = specOf(dst);
    if (!spec) return;
    const moved = dst !== state.from;
    if (moved && (!spec.dropArgs || spec.dropArgs(task) === null)) return;
    const index = ids.indexOf(activeId);
    if (!moved && base[dst].indexOf(activeId) === index) return;

    const writes = new Map<string, TaskUpdateArgs>();
    const dropArgs = moved ? (spec.dropArgs?.(task) ?? {}) : {};
    if (moved) writes.set(activeId, { ...dropArgs });
    if (spec.reorder) {
      const group = ids.filter((x) => x !== activeId).map((x) => ({ id: x, order: nodeById.get(x)?.task.order ?? null }));
      for (const w of planReorder(group, activeId, index)) {
        writes.set(w.id, { ...(writes.get(w.id) ?? {}), order: w.order });
      }
    }
    const items = [...writes.entries()]
      .map(([id, args]) => ({ task: nodeById.get(id)?.task as Task, args }))
      .filter((x) => x.task && Object.keys(x.args).length);
    if (items.length) {
      onBeforeDrop?.();
      // A move between groups writes that group's field: one Undo restores it.
      const name = spec.label ?? (typeof spec.title === "string" ? spec.title : null);
      const undo = moved && Object.keys(dropArgs).length ? undoFor(task, dropArgs) : null;
      patchMany.mutate(items, {
        onSuccess: () => {
          if (!moved || !Object.keys(dropArgs).length) return;
          const text = name ? `Moved to ${name}` : "Moved";
          // An empty inverse (an owner the core cannot clear) gets a plain toast, never a dead Undo.
          if (undo) toastWithUndo(text, () => taskUpdate(task.id, toWire(undo) as TaskUpdateArgs));
          else toast.success(text);
        },
      });
    }
  };

  const activeNode = drag ? nodeById.get(drag.active) : null;
  if (filters && filtersActive(filters.value) && !groups.some((g) => g.tasks.length > 0)) {
    return <FilteredToZero filters={filters.value} onChange={filters.onChange} />;
  }

  const content = (
    <div className={cn("pb-10", className)}>
      {built.map(({ spec }) => {
        const ids = containers[spec.key] ?? [];
        // Empty custom groups exist only as drop targets while a row is being dragged.
        if (spec.dropZoneOnly && ids.length === 0 && !drag) return null;
        const collapsible = spec.collapsible ?? !!spec.title;
        // The stored set records a toggle away from the group's default.
        const isCollapsed = collapsible && collapsedGroups.has(spec.key) !== !!spec.defaultCollapsed;
        const lastOrder = (() => {
          let max: number | null = null;
          for (const t of spec.tasks) if (typeof t.order === "number" && (max === null || t.order > max)) max = t.order;
          return max;
        })();
        const addDefaults = spec.addDefaults
          ? { ...spec.addDefaults, order: spec.reorder ? (lastOrder ?? 0) + ORDER_STEP : spec.addDefaults.order }
          : null;
        return (
          <Group
            key={spec.key}
            spec={spec}
            count={countTopLevel(spec.tasks)}
            collapsible={collapsible}
            collapsed={isCollapsed}
            onToggle={() => toggleGroup(spec.key)}
            droppable={!isStatic}
            highlight={!!drag && drag.from !== spec.key && ids.includes(drag.active)}
          >
            {!isCollapsed && (
              <>
                {ids.length > 0 && (
                  <div role="list">
                    <SortableContext id={spec.key} items={ids} strategy={verticalListSortingStrategy} disabled={isStatic}>
                      {ids.map((id) => {
                        const node = nodeById.get(id);
                        if (!node) return null;
                        return (
                          <SortableNode
                            key={id}
                            node={node}
                            disabled={!!isStatic}
                            collapsedParents={collapsedParents}
                            toggleParent={toggleParent}
                            openIds={openIds}
                            parentTitle={(n) => (n.orphanOf ? (openMap.get(n.orphanOf)?.title ?? null) : null)}
                            projectOf={(t) => (t.project ? (projects.get(t.project) ?? null) : null)}
                            rowProps={rowProps}
                          />
                        );
                      })}
                    </SortableContext>
                  </div>
                )}
                {ids.length === 0 &&
                  (drag && spec.dropZoneOnly ? (
                    <div className="my-1.5 flex h-10 items-center justify-center rounded-lg border border-dashed border-foreground/25 text-xs text-muted-foreground">
                      Move to {spec.label ?? (typeof spec.title === "string" ? spec.title : "this group")}
                    </div>
                  ) : (
                    spec.empty
                  ))}
                {addDefaults && <TaskComposer defaults={addDefaults} label={spec.addLabel} />}
              </>
            )}
          </Group>
        );
      })}
    </div>
  );

  if (isStatic) return content;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setKeyboardDrag(false);
        setDrag(null);
      }}
    >
      {content}
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeNode ? (
            <div className="cursor-grabbing">
              <TaskRow
                task={activeNode.task}
                subtaskCount={descendantCount(activeNode)}
                project={activeNode.task.project ? (projects.get(activeNode.task.project) ?? null) : null}
                blockedCount={openBlockers(activeNode.task, openIds).length}
                drag={{ isOverlay: true }}
                {...rowProps}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/* ---------------------------------------------------------------- group */

function Group({
  spec,
  count,
  collapsible,
  collapsed,
  onToggle,
  droppable,
  highlight,
  children,
}: {
  spec: TaskGroupSpec;
  count: number;
  collapsible: boolean;
  collapsed: boolean;
  onToggle: () => void;
  droppable: boolean;
  highlight: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP_PREFIX}${spec.key}`, disabled: !droppable });
  return (
    <section
      ref={setNodeRef}
      role="group"
      aria-label={typeof spec.title === "string" ? spec.title : undefined}
      className={cn("relative rounded-lg transition-colors", spec.title ? "mt-6 first:mt-0" : "", (highlight || isOver) && droppable && "bg-accent")}
    >
      {spec.title && (
        <header className="group/gh flex h-9 items-center gap-1.5 border-b border-border/80">
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${typeof spec.title === "string" ? spec.title : (spec.label ?? "section")}`}
              className="-ml-6 inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 opacity-35 transition-opacity group-hover/gh:opacity-100 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100"
            >
              <ChevronRightIcon className={cn("size-3.5 transition-transform duration-150", !collapsed && "rotate-90")} />
            </button>
          ) : null}
          <h2
            onClick={collapsible ? onToggle : undefined}
            className={cn(
              "min-w-0 truncate text-body font-semibold tracking-tight",
              collapsible && "cursor-pointer select-none",
              spec.dim && "text-muted-foreground font-medium",
              spec.tone === "danger" && "text-due-overdue",
            )}
          >
            {spec.title}
          </h2>
          {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
          <div className="ml-auto flex items-center gap-1">{spec.actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- nodes */

function SortableNode({
  node,
  disabled,
  collapsedParents,
  toggleParent,
  openIds,
  parentTitle,
  projectOf,
  rowProps,
}: {
  node: TaskNode;
  disabled: boolean;
  collapsedParents: ReadonlySet<string>;
  toggleParent: (id: string) => void;
  openIds: ReadonlySet<string>;
  parentTitle: (n: TaskNode) => string | null;
  projectOf: (t: Task) => import("@/lib/types").Project | null;
  rowProps?: TaskListProps["rowProps"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.task.id, disabled });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10")}>
      <NodeRows
        node={node}
        depth={0}
        drag={disabled ? undefined : { attributes, listeners: listeners as never, isDragging }}
        collapsedParents={collapsedParents}
        toggleParent={toggleParent}
        openIds={openIds}
        parentTitle={parentTitle}
        projectOf={projectOf}
        rowProps={rowProps}
      />
    </div>
  );
}

function NodeRows({
  node,
  depth,
  drag,
  collapsedParents,
  toggleParent,
  openIds,
  parentTitle,
  projectOf,
  rowProps,
}: {
  node: TaskNode;
  depth: number;
  drag?: TaskRowProps["drag"];
  collapsedParents: ReadonlySet<string>;
  toggleParent: (id: string) => void;
  openIds: ReadonlySet<string>;
  parentTitle: (n: TaskNode) => string | null;
  projectOf: (t: Task) => import("@/lib/types").Project | null;
  rowProps?: TaskListProps["rowProps"];
}) {
  const collapsed = collapsedParents.has(node.task.id);
  const count = descendantCount(node);
  return (
    <Fragment>
      <TaskRow
        task={node.task}
        depth={depth}
        subtaskCount={count}
        collapsed={collapsed}
        onToggleCollapse={count ? () => toggleParent(node.task.id) : undefined}
        parentTitle={depth === 0 ? parentTitle(node) : null}
        blockedCount={openBlockers(node.task, openIds).length}
        project={projectOf(node.task)}
        drag={drag}
        {...rowProps}
      />
      {!collapsed && !drag?.isDragging &&
        node.children.map((c) => (
          <NodeRows
            key={c.task.id}
            node={c}
            depth={depth + 1}
            collapsedParents={collapsedParents}
            toggleParent={toggleParent}
            openIds={openIds}
            parentTitle={parentTitle}
            projectOf={projectOf}
            rowProps={rowProps}
          />
        ))}
    </Fragment>
  );
}
