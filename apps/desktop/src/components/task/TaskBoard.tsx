/**
 * Kanban board for a project: columns by section (drag writes `section` + `order`) or by status
 * (To do / In progress / Blocked / Done; drag claims, releases, reopens or completes).
 */
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, LockIcon, PlusIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TaskUpdateArgs } from "@/lib/api";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePatchMany, useTaskActions } from "./actions";
import { useOpenIds } from "./hooks";
import {
  BOARD_STATUSES,
  BOARD_STATUS_LABEL,
  boardStatusOf,
  buildTree,
  compareManual,
  descendantCount,
  ORDER_STEP,
  openBlockers,
  planReorder,
  type BoardStatus,
  type TaskNode,
} from "./model";
import { completeAnimated, KEYBOARD_DRAG, setKeyboardDrag } from "./selection";
import { TaskComposer, type ComposerDefaults } from "./TaskComposer";
import { TaskRow } from "./TaskRow";

export interface TaskBoardProps {
  project: string;
  mode: "section" | "status";
  tasks: Task[];
  completed: Task[];
  sections: string[];
  /** Section board only: create an (empty, per-viewer) section. */
  onAddSection?: (name: string) => void;
  /** Section board only: runs before a drop writes, so the column order is pinned first. */
  onBeforeDrop?: () => void;
}

interface Column {
  key: string;
  title: string;
  icon?: ReactNode;
  nodes: TaskNode[];
  addDefaults?: ComposerDefaults | null;
  accepts: boolean;
  tone?: string;
}

const STATUS_ICON: Record<BoardStatus, ReactNode> = {
  open: <CircleDashedIcon className="size-3.5 text-muted-foreground" />,
  progress: <CircleDotIcon className="size-3.5 text-status-working" />,
  blocked: <LockIcon className="size-3.5 text-warning" />,
  done: <CircleCheckIcon className="size-3.5 text-success" />,
};

export function TaskBoard({ project, mode, tasks, completed, sections, onAddSection, onBeforeDrop }: TaskBoardProps) {
  const openIds = useOpenIds();
  const actions = useTaskActions();
  const patchMany = usePatchMany();

  const columns: Column[] = useMemo(() => {
    if (mode === "status") {
      const by = new Map<BoardStatus, Task[]>(BOARD_STATUSES.map((s) => [s, []]));
      for (const t of [...tasks, ...completed]) by.get(boardStatusOf(t, openIds))?.push(t);
      return BOARD_STATUSES.map((s) => ({
        key: s,
        title: BOARD_STATUS_LABEL[s],
        icon: STATUS_ICON[s],
        nodes: (by.get(s) ?? [])
          .sort(s === "done" ? (a, b) => (b.completed ?? b.updated ?? "").localeCompare(a.completed ?? a.updated ?? "") : compareManual)
          .map((task) => ({ task, children: [], orphanOf: null })),
        addDefaults: s === "open" ? { project } : null,
        accepts: s !== "blocked",
      }));
    }
    const names = ["", ...sections.filter(Boolean)];
    for (const t of tasks) if (t.section && !names.includes(t.section)) names.push(t.section);
    const roots = buildTree(tasks);
    const shown = names.filter((n) => n !== "" || names.length === 1 || roots.some((r) => !r.task.section));
    return shown.map((name) => ({
      key: name,
      title: name || "No section",
      nodes: roots.filter((n) => (n.task.section ?? "") === name),
      addDefaults: { project, section: name || null },
      accepts: true,
    }));
  }, [mode, tasks, completed, sections, project, openIds]);

  const nodeById = useMemo(() => {
    const m = new Map<string, TaskNode>();
    for (const c of columns) for (const n of c.nodes) m.set(n.task.id, n);
    return m;
  }, [columns]);
  const base = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c.nodes.map((n) => n.task.id)])), [columns]);
  const [drag, setDrag] = useState<{ active: string; from: string; containers: Record<string, string[]> } | null>(null);
  const containers = drag?.containers ?? base;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, KEYBOARD_DRAG));

  const find = (id: string, within: Record<string, string[]>) =>
    id.startsWith("col:") ? id.slice(4) : (Object.keys(within).find((k) => within[k].includes(id)) ?? null);

  const onDragStart = (e: DragStartEvent) => {
    setKeyboardDrag(e.activatorEvent instanceof KeyboardEvent);
    const id = String(e.active.id);
    const from = find(id, base);
    if (from !== null) setDrag({ active: id, from, containers: base });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!drag || !over) return;
    const a = String(active.id);
    const o = String(over.id);
    const src = find(a, drag.containers);
    const dst = find(o, drag.containers);
    if (src === null || dst === null || src === dst) return;
    if (!columns.find((c) => c.key === dst)?.accepts) return;
    const target = drag.containers[dst];
    const idx = target.indexOf(o);
    const index = idx < 0 ? target.length : idx;
    setDrag({
      ...drag,
      containers: {
        ...drag.containers,
        [src]: drag.containers[src].filter((x) => x !== a),
        [dst]: [...target.slice(0, index), a, ...target.slice(index)],
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setKeyboardDrag(false);
    const state = drag;
    setDrag(null);
    if (!state || !over) return;
    const a = String(active.id);
    const task = nodeById.get(a)?.task;
    const dst = find(a, state.containers);
    if (!task || dst === null) return;
    const ids = [...state.containers[dst]];
    const o = String(over.id);
    if (!o.startsWith("col:") && ids.includes(o) && o !== a) {
      const from = ids.indexOf(a);
      const to = ids.indexOf(o);
      ids.splice(from, 1);
      ids.splice(to, 0, a);
    }
    const moved = dst !== state.from;

    if (mode === "status") {
      if (!moved) return;
      const to = dst as BoardStatus;
      if (to === "blocked") {
        toast.info("Blocked comes from open blockers — add one in the task’s details.");
        return;
      }
      if (to === "done") completeAnimated(task, actions.complete);
      else if (to === "progress") {
        if (task.status === "done" || task.status === "cancelled") void actions.reopenAndClaim(task);
        else actions.claim(task);
      } else if (to === "open") {
        if (task.status === "claimed") actions.release(task);
        else if (task.status === "done" || task.status === "cancelled") actions.reopen(task);
      }
      return;
    }

    const index = ids.indexOf(a);
    if (!moved && base[dst].indexOf(a) === index) return;
    const writes = new Map<string, TaskUpdateArgs>();
    if (moved) writes.set(a, { section: dst || null });
    const group = ids.filter((x) => x !== a).map((x) => ({ id: x, order: nodeById.get(x)?.task.order ?? null }));
    for (const w of planReorder(group, a, index)) writes.set(w.id, { ...(writes.get(w.id) ?? {}), order: w.order });
    onBeforeDrop?.();
    patchMany.mutate([...writes.entries()].map(([id, args]) => ({ task: nodeById.get(id)?.task as Task, args })).filter((x) => x.task));
  };

  const activeNode = drag ? nodeById.get(drag.active) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setKeyboardDrag(false);
        setDrag(null);
      }}
    >
      <div className="-mx-5 flex min-h-[60vh] items-start gap-3 overflow-x-auto px-5 pb-10 sm:-mx-10 sm:px-10">
        {columns.map((c) => (
          <BoardColumn
            key={c.key}
            column={c}
            ids={containers[c.key] ?? []}
            nodeById={nodeById}
            openIds={openIds}
            highlight={!!drag && drag.from !== c.key && (containers[c.key] ?? []).includes(drag.active)}
            dragging={!!drag}
          />
        ))}
        {mode === "section" && onAddSection && <AddSectionColumn existing={columns.map((c) => c.key)} onAdd={onAddSection} />}
      </div>
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeNode ? (
            <div className="w-[272px] cursor-grabbing">
              <TaskRow task={activeNode.task} variant="card" showProject={false} subtaskCount={descendantCount(activeNode)} drag={{ isOverlay: true }} />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function BoardColumn({
  column,
  ids,
  nodeById,
  openIds,
  highlight,
  dragging,
}: {
  column: Column;
  ids: string[];
  nodeById: Map<string, TaskNode>;
  openIds: ReadonlySet<string>;
  highlight: boolean;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}`, disabled: !column.accepts });
  const [adding, setAdding] = useState(false);
  const last = ids.length ? (nodeById.get(ids[ids.length - 1])?.task.order ?? null) : null;
  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      className={cn(
        "flex max-h-[calc(100svh-11rem)] w-[288px] shrink-0 flex-col rounded-xl bg-muted/40 transition-colors dark:bg-muted/25",
        (highlight || isOver) && column.accepts && "bg-primary/[0.06] ring-1 ring-primary/20",
        dragging && !column.accepts && "opacity-60",
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 px-3">
        {column.icon}
        <h2 className={cn("truncate text-[13px] font-semibold", !column.key && "text-muted-foreground")}>{column.title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{ids.length}</span>
        {column.addDefaults && (
          <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" aria-label={`Add task to ${column.title}`} onClick={() => setAdding(true)}>
            <PlusIcon />
          </Button>
        )}
      </header>
      <div className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext id={column.key} items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const node = nodeById.get(id);
            return node ? <Card key={id} node={node} blocked={openBlockers(node.task, openIds).length} /> : null;
          })}
        </SortableContext>
        {ids.length === 0 && !adding && (
          <div className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground/70">
            {column.accepts ? "Drop tasks here" : "Tasks with open blockers"}
          </div>
        )}
        {column.addDefaults && (
          <TaskComposer
            key={adding ? "open" : "closed"}
            autoOpen={adding}
            onClose={() => setAdding(false)}
            compact
            className="px-1"
            defaults={{ ...column.addDefaults, order: (last ?? 0) + ORDER_STEP }}
          />
        )}
      </div>
    </section>
  );
}

function Card({ node, blocked }: { node: TaskNode; blocked: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <TaskRow
        task={node.task}
        variant="card"
        showProject={false}
        subtaskCount={descendantCount(node)}
        blockedCount={blocked}
        drag={{ attributes, listeners: listeners as never, isDragging }}
      />
    </div>
  );
}

/** Ghost column at the end of a section board: click, name, Enter. */
function AddSectionColumn({ existing, onAdd }: { existing: string[]; onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const submit = () => {
    const n = name.trim();
    if (!n) return setEditing(false);
    if (existing.includes(n)) {
      toast.error(`A section “${n}” already exists`);
      return;
    }
    onAdd(n);
    setName("");
    setEditing(false);
  };
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-10 w-[272px] shrink-0 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <PlusIcon className="size-4" /> Add section
      </button>
    );
  }
  return (
    <div className="w-[272px] shrink-0 rounded-xl bg-muted/40 p-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        onBlur={submit}
        placeholder="Name this section"
        aria-label="Section name"
        className="h-8 w-full rounded-md border bg-background px-2.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </div>
  );
}
