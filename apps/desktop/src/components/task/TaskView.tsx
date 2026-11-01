/**
 * Shared frame for task views: big title + subtitle, toolbar, loading skeleton, error and the
 * view-wide keyboard map (j/k, Enter, e/x, 1–4, t, r, ⌘⌫, ⌘⇧↑/↓, Tab/⇧Tab, v, s, l).
 */
import { CloudOffIcon, RotateCwIcon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useRoute } from "@/lib/router";
import { canFocus, focusModeStore } from "@/app/focus-mode";
import { FocusToggle } from "@/app/FocusControls";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { closeDetail, openTask, useDetail } from "@/app/detail";
import { moveDueToDay } from "@/lib/dates";
import { useHotkey } from "@/lib/hotkeys";
import { explainError } from "@/lib/errors";
import type { Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addDays, startOfDay } from "date-fns";
import { toast } from "sonner";
import { usePatchMany, useTaskActions } from "./actions";
import { BulkBar } from "./BulkBar";
import { planIndent, planMove, planOutdent } from "./model";
import {
  clearMulti,
  extendSelection,
  useMultiCount,
  completeAnimated,
  openRowPicker,
  rowPlace,
  moveSelection,
  overlayOpen,
  rowTask,
  select,
  selectedId,
  selectNeighbourOf,
  startEditing,
  visibleRowIds,
} from "./selection";
import "./register";

export interface TaskViewProps {
  title: ReactNode;
  /** Small line under the title (date, counts). */
  subtitle?: ReactNode;
  /** Right side of the title row. */
  toolbar?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Wider canvas (board). */
  wide?: boolean;
  /** Under the header, above the list (active filter chips). */
  below?: ReactNode;
}

export function TaskView({ title, subtitle, toolbar, icon, children, className, wide, below }: TaskViewProps) {
  useTaskKeyboard();
  const route = useRoute();
  const focus = focusModeStore.use();
  const eligible = canFocus(route.name, !!wide);
  useLayoutEffect(() => focusModeStore.registerView(route.path, eligible), [route.path, eligible]);
  useHotkey("mod+\\", focusModeStore.toggle, { enabled: eligible, allowInInput: false, description: "Toggle Focus mode", group: "General" });
  return (
    <div className={cn("@container/view mx-auto w-full px-4 pt-7 pb-10 sm:px-8 sm:pt-9", wide ? "max-w-none" : focus ? "max-w-[700px] pt-10 sm:pt-16" : "max-w-[940px]", className)}>
      <PageHeader title={title} subtitle={subtitle} actions={<><FocusToggle />{toolbar}</>} icon={icon} className={cn(below && "mb-2", focus && "[&_h1]:text-[44px]")} />
      {below}
      {children}
      <BulkBar />
    </div>
  );
}

/** Row skeletons that match TaskRow's rhythm. */
export function TaskListSkeleton({ rows = 7, groups = 1 }: { rows?: number; groups?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading tasks">
      {Array.from({ length: groups }, (_, g) => (
        <div key={g}>
          {groups > 1 && <Skeleton className="mb-2 h-4 w-28" />}
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-start gap-2.5 border-b border-border/60 py-2.5">
              <Skeleton className="size-[18px] shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className={["h-3.5 w-1/2", "h-3.5 w-5/6", "h-3.5 w-2/3"][(i + g) % 3]} />
                {i % 3 !== 1 && <Skeleton className="h-3 w-24 opacity-70" />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Error panel for a failed query: a plain-words title and next step, the raw message below. */
export function TaskQueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const x = explainError(error, "tasks");
  return (
    <EmptyState
      icon={x.kind === "offline" ? CloudOffIcon : x.kind === "forbidden" ? ShieldAlertIcon : TriangleAlertIcon}
      tone="muted"
      title={x.title}
      description={
        <>
          <span className="block">{x.hint}</span>
          {x.raw !== x.hint && <code className="mt-2 block font-mono text-xs break-words text-muted-foreground">{x.raw}</code>}
        </>
      }
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCwIcon /> Retry
        </Button>
      }
    />
  );
}

/* ------------------------------------------------------------- keyboard */

const PRI: Record<string, Priority> = { "1": "urgent", "2": "high", "3": "normal", "4": "low" };

function useTaskKeyboard() {
  const actions = useTaskActions();
  const { target } = useDetail();
  const detailTask = target?.kind === "task" ? target.id : null;
  const group = "Tasks";

  const current = () => {
    if (overlayOpen()) return null;
    let id = selectedId();
    if (!id || !visibleRowIds().includes(id)) {
      id = detailTask && visibleRowIds().includes(detailTask) ? detailTask : null;
      if (id) select(id);
    }
    return rowTask(id);
  };

  const move = (d: number) => {
    if (overlayOpen()) return;
    if (!selectedId() && detailTask) select(detailTask);
    moveSelection(d);
    const id = selectedId();
    if (id && detailTask && id !== detailTask) openTask(id);
  };

  useHotkey("shift+j", () => !overlayOpen() && extendSelection(1), { description: "Extend selection down", group });
  useHotkey("shift+k", () => !overlayOpen() && extendSelection(-1), { description: "Extend selection up", group });
  useHotkey("shift+arrowdown", () => !overlayOpen() && extendSelection(1), { group });
  useHotkey("shift+arrowup", () => !overlayOpen() && extendSelection(-1), { group });
  const multiCount = useMultiCount();
  useHotkey("escape", () => clearMulti(), { description: "Clear selection", group, enabled: multiCount > 0, allowDefault: true });
  useEffect(() => clearMulti, []);
  useHotkey("j", () => move(1), { description: "Next task", group });
  useHotkey("k", () => move(-1), { description: "Previous task", group });
  useHotkey("arrowdown", () => move(1), { group });
  useHotkey("arrowup", () => move(-1), { group });
  useHotkey(
    "enter",
    (e) => {
      // Enter on a focused control keeps its native meaning.
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("button, a, [role=button], [role=menuitem], [role=option], [role=tab], summary") || overlayOpen()) return;
      e.preventDefault();
      const t = current();
      if (t) openTask(t.id);
      else moveSelection(1);
    },
    { description: "Open task", group, allowDefault: true },
  );
  const complete = () => {
    const t = current();
    if (!t) return;
    if (t.status === "done" || t.status === "cancelled") actions.reopen(t);
    else completeAnimated(t, actions.complete);
  };
  useHotkey("e", complete, { description: "Complete task", group });
  useHotkey("x", complete, { group });
  const pri = (k: string) => () => {
    const t = current();
    if (t) actions.setPriority(t, PRI[k]);
  };
  useHotkey("1", pri("1"), { description: "Priority 1–4", group });
  useHotkey("2", pri("2"), { group });
  useHotkey("3", pri("3"), { group });
  useHotkey("4", pri("4"), { group });
  useHotkey(
    "t",
    () => {
      const t = current();
      if (t) actions.schedule(t, moveDueToDay(t.due, startOfDay(new Date())));
    },
    { description: "Schedule for today", group },
  );
  useHotkey(
    "shift+t",
    () => {
      const t = current();
      if (t) actions.schedule(t, moveDueToDay(t.due, addDays(startOfDay(new Date()), 1)));
    },
    { description: "Schedule for tomorrow", group },
  );
  useHotkey(
    "r",
    () => {
      const t = current();
      if (t) startEditing(t.id);
    },
    { description: "Rename task", group },
  );
  const del = () => {
    const t = current();
    if (!t) return;
    selectNeighbourOf(t.id);
    if (detailTask === t.id) closeDetail();
    actions.remove(t);
  };
  useHotkey("mod+backspace", del, { description: "Delete task", group, allowInInput: false });
  useHotkey("mod+delete", del, { group, allowInInput: false });

  // Structure edits: reorder, indent, outdent. They write `order` / `parent` through the same
  // patch a drag uses, and only in manually ordered lists (a date-sorted view has no order).
  const patchMany = usePatchMany();
  const structural = () => {
    const t = current();
    const place = t ? rowPlace(t.id) : null;
    if (!t || !place) return null;
    if (!place.manual) {
      toast.info(
        place.sorted
          ? "Manual order is off while sorted. Choose Sort by: Manual in Display to reorder."
          : "This list is sorted for you. Reorder and indent in a project or the Inbox.",
      );
      return null;
    }
    return { t, place };
  };
  const reorder = (delta: -1 | 1) => () => {
    const s = structural();
    if (!s) return;
    const writes = planMove(s.place.siblings, s.t.id, delta);
    if (!writes) return;
    s.place.beforeWrite?.();
    patchMany.mutate(writes.map((w) => ({ task: s.place.siblings.find((x) => x.id === w.id) ?? s.t, args: { order: w.order } })));
    select(s.t.id, { scroll: true, focus: true });
  };
  useHotkey("mod+shift+arrowup", reorder(-1), { description: "Move task up", group, allowInInput: false });
  useHotkey("mod+shift+arrowdown", reorder(1), { description: "Move task down", group, allowInInput: false });
  // ⌥↑/⌥↓ (design § Project: list layout) take the same path.
  useHotkey("alt+arrowup", reorder(-1), { group, allowInInput: false });
  useHotkey("alt+arrowdown", reorder(1), { group, allowInInput: false });
  // Tab keeps its focus meaning unless it actually indents a focused task row: a sorted list,
  // the first sibling or a top-level row leave the key to the browser.
  const onRow = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.("[data-task-row]");
  const structureTarget = (e: KeyboardEvent) => {
    if (!onRow(e) || overlayOpen()) return null;
    const t = rowTask(selectedId());
    const place = t ? rowPlace(t.id) : null;
    return t && place?.manual ? { t, place } : null;
  };
  useHotkey(
    "tab",
    (e) => {
      const s = structureTarget(e);
      const plan = s ? planIndent(s.place.siblings, s.t.id, (id) => rowPlace(id)?.children ?? []) : null;
      if (!s || !plan) return;
      e.preventDefault();
      s.place.beforeWrite?.();
      actions.update(s.t, { parent: plan.parent, order: plan.order });
      select(s.t.id, { scroll: true, focus: true });
    },
    { description: "Make subtask of the task above", group, allowDefault: true },
  );
  useHotkey(
    "shift+tab",
    (e) => {
      const s = structureTarget(e);
      if (!s || !s.t.parent) return;
      e.preventDefault();
      const parentPlace = s.place.parent ? rowPlace(s.place.parent.id) : null;
      const plan = planOutdent(s.place.parent, parentPlace?.siblings ?? null);
      s.place.beforeWrite?.();
      actions.update(s.t, plan.order === null ? { parent: null } : { parent: null, order: plan.order });
      select(s.t.id, { scroll: true, focus: true });
    },
    { description: "Lift subtask out of its parent", group, allowDefault: true },
  );
  const picker = (kind: "project" | "date" | "labels") => () => {
    const t = current();
    if (!t) return;
    select(t.id, { scroll: true });
    openRowPicker({ id: t.id, kind });
  };
  useHotkey("v", picker("project"), { description: "Move to project", group });
  useHotkey("s", picker("date"), { description: "Schedule…", group });
  useHotkey("l", picker("labels"), { description: "Labels", group });
}
