/**
 * View-wide keyboard selection over every visible task row (lists, groups and board cards).
 *
 * Rows render `data-task-row={id}` and register their task; navigation walks the DOM order
 * inside `#main`, so collapsed groups and subtasks are skipped naturally and one selection spans
 * every list on the page. Also holds the short-lived "completing" set that drives the check
 * animation before a row leaves the list.
 */
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useSyncExternalStore } from "react";
import type { Task } from "@/lib/types";

/* ----------------------------------------------------------------- store */

let selected: string | null = null;
let editing: string | null = null;
let completing = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const rows = new Map<string, Task>();

/** Rows call this so keyboard actions can resolve the selected id to a task. */
export function useRegisterRow(task: Task) {
  useEffect(() => {
    rows.set(task.id, task);
  }, [task]);
  useEffect(() => {
    const id = task.id;
    return () => {
      if (rows.get(id) === task) rows.delete(id);
    };
  }, [task]);
}

export const rowTask = (id: string | null) => (id ? (rows.get(id) ?? null) : null);

export function select(id: string | null, opts: { scroll?: boolean; focus?: boolean } = {}) {
  if (selected !== id) {
    selected = id;
    emit();
  }
  if (id && (opts.scroll || opts.focus)) {
    requestAnimationFrame(() => {
      const el = rowElement(id);
      if (!el) return;
      // Keyboard navigation moves DOM focus too, so screen readers announce the row. Never
      // steal focus from a field, a menu or the detail pane the user is working in.
      if (opts.focus && focusMayMove()) el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    });
  }
}

function focusMayMove(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body) return true;
  if (a.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return false;
  return !!a.closest("#main") || a.hasAttribute("data-task-row");
}

export const selectedId = () => selected;

/** True while some row on the page is selected (rows use it for the roving tab stop). */
export function useHasSelection(): boolean {
  return useSyncExternalStore(subscribe, () => selected !== null && rows.has(selected));
}

export function useIsSelected(id: string): boolean {
  return useSyncExternalStore(subscribe, () => selected === id);
}

export function useSelectedId(): string | null {
  return useSyncExternalStore(subscribe, () => selected);
}

/* ------------------------------------------------------------ inline edit */

export function startEditing(id: string | null) {
  if (editing === id) return;
  editing = id;
  emit();
}

export function useIsEditing(id: string): boolean {
  return useSyncExternalStore(subscribe, () => editing === id);
}

/* ------------------------------------------------------------- completing */

export function setCompleting(id: string, on: boolean) {
  if (completing.has(id) === on) return;
  completing = new Set(completing);
  if (on) completing.add(id);
  else completing.delete(id);
  emit();
}

export function useIsCompleting(id: string): boolean {
  return useSyncExternalStore(subscribe, () => completing.has(id));
}

/** Delay before the completion write, so the check + fade animation is seen. */
export const COMPLETE_DELAY_MS = 600;

/**
 * Complete with the row animation: check now, fade, then write (the optimistic update removes
 * the row). The completing flag clears once the write settles (recurring rows stay and uncheck).
 */
export function completeAnimated(
  task: Task,
  complete: (t: Task, onSettled: () => void, onError: () => void) => void,
) {
  if (completing.has(task.id)) return;
  setCompleting(task.id, true);
  window.setTimeout(() => {
    const wasSelected = selected === task.id;
    if (!task.recur) selectNeighbourOf(task.id);
    const movedTo = selected;
    // The row may unmount (optimistic removal) before the write settles, so a per-call
    // onSettled is not guaranteed to run: clear the flag on a timer as well.
    const clear = () => setCompleting(task.id, false);
    complete(
      task,
      () => window.setTimeout(clear, task.recur ? 250 : 0),
      () => {
        // The write failed and the row came back: put the cursor back on it, unless the user
        // already moved on, so the next `e` does not hit the neighbour.
        if (wasSelected && selected === movedTo) requestAnimationFrame(() => select(task.id, { scroll: true, focus: true }));
      },
    );
    window.setTimeout(clear, task.recur ? 1500 : 2000);
  }, task.recur ? 450 : COMPLETE_DELAY_MS);
}

/* ----------------------------------------------------------- DOM walking */

function rowElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-task-row="${CSS.escape(id)}"]`);
}

/** Visible row ids in document order. */
export function visibleRowIds(): string[] {
  const root = document.getElementById("main") ?? document.body;
  return [...root.querySelectorAll<HTMLElement>("[data-task-row]")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.dataset.taskRow ?? "")
    .filter(Boolean);
}

/** Move the selection by `delta` rows (wraps at neither end). Selects the first row if none. */
export function moveSelection(delta: number) {
  const ids = visibleRowIds();
  if (!ids.length) return;
  const i = selected ? ids.indexOf(selected) : -1;
  const next = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + delta));
  select(ids[next], { scroll: true, focus: true });
}

/** After the selected row leaves (complete/delete), keep the cursor on its neighbour. */
export function selectNeighbourOf(id: string) {
  if (selected !== id) return;
  const ids = visibleRowIds();
  const i = ids.indexOf(id);
  const next = ids[i + 1] ?? ids[i - 1] ?? null;
  select(next && next !== id ? next : null, { scroll: true, focus: true });
}

/**
 * A menu, popover or dialog is open: list shortcuts stand down. The detail pane (a sheet on
 * narrow windows) is the exception — it carries `data-task-detail`.
 */
export function overlayOpen(): boolean {
  if (keyboardDrag) return true;
  if (
    document.querySelector(
      '[role="menu"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"], [cmdk-root]',
    )
  )
    return true;
  return [...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((d) => !d.querySelector("[data-task-detail]"));
}

/* ------------------------------------------------------- row structure */

/** Where a rendered row sits, for keyboard reorder / indent / outdent. */
export interface RowPlace {
  /** The row and its siblings in shown order (group roots, or a parent's children). */
  siblings: Task[];
  /** The list is manually ordered, so structure edits make sense there. */
  manual: boolean;
  /** The parent row when it is shown in the same list. */
  parent: Task | null;
  /** This row's shown children. */
  children: Task[];
  /** Runs before a structure write (a sectioned list pins its section order). */
  beforeWrite?: () => void;
}

const places = new Map<string, RowPlace>();

/** Lists register every row's place; the returned cleanup removes only what it registered. */
export function registerPlaces(entries: [string, RowPlace][]): () => void {
  for (const [id, p] of entries) places.set(id, p);
  return () => {
    for (const [id, p] of entries) if (places.get(id) === p) places.delete(id);
  };
}

export const rowPlace = (id: string | null) => (id ? (places.get(id) ?? null) : null);

/* ----------------------------------------------------------- row pickers */

export type RowPicker = "project" | "date" | "labels";
let picker: { id: string; kind: RowPicker } | null = null;

/** Open a picker anchored on a row (keyboard `v`, `s`, `l`). `null` closes it. */
export function openRowPicker(next: { id: string; kind: RowPicker } | null) {
  picker = next;
  emit();
}

export function useRowPicker(id: string): RowPicker | null {
  return useSyncExternalStore(subscribe, () => (picker?.id === id ? picker.kind : null));
}

/* ------------------------------------------------------ keyboard drag */

/** Keyboard drag (dnd-kit): Shift/Alt+Space picks a row up, arrows move it, Space drops, Esc cancels. */
export const KEYBOARD_DRAG = {
  coordinateGetter: sortableKeyboardCoordinates,
  keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
};

let keyboardDrag = false;
/** A keyboard drag is running: list shortcuts stand down so arrows move the card. */
export function setKeyboardDrag(on: boolean) {
  keyboardDrag = on;
}
export const isKeyboardDrag = () => keyboardDrag;

/* ---------------------------------------------------------- multi-select */

let multi: ReadonlySet<string> = new Set();
let anchor: string | null = null;

function setMulti(next: Set<string>) {
  multi = next;
  emit();
}

/** ⌘/Ctrl-click: add or remove one row (the current cursor row joins the set first). */
export function toggleMulti(id: string) {
  const next = new Set(multi);
  if (!next.size && selected && selected !== id) next.add(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  anchor = id;
  setMulti(next);
  select(id);
}

/** The visible rows from `a` to `b` inclusive, in document order. */
export function rangeBetween(ids: readonly string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return j < 0 ? [] : [b];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** Shift-click: select every visible row from the anchor (or the cursor) to `id`. */
export function rangeTo(id: string) {
  const from = anchor ?? selected ?? id;
  setMulti(new Set(rangeBetween(visibleRowIds(), from, id)));
  anchor = from;
  select(id);
}

/** Shift+J/K: move the cursor and grow (or shrink) the range with it. */
export function extendSelection(delta: number) {
  const ids = visibleRowIds();
  if (!ids.length) return;
  const cur = selected && ids.includes(selected) ? selected : null;
  if (!cur) return moveSelection(delta);
  const i = ids.indexOf(cur);
  const next = ids[Math.max(0, Math.min(ids.length - 1, i + delta))];
  const from = anchor && ids.includes(anchor) ? anchor : cur;
  anchor = from;
  setMulti(new Set(rangeBetween(ids, from, next)));
  select(next, { scroll: true, focus: true });
}

export function clearMulti() {
  anchor = null;
  if (multi.size) setMulti(new Set());
}

/** Selected ids still on screen, in document order. */
export function multiIds(): string[] {
  return visibleRowIds().filter((id) => multi.has(id));
}

export function useIsMultiSelected(id: string): boolean {
  return useSyncExternalStore(subscribe, () => multi.has(id));
}

export function useMultiCount(): number {
  return useSyncExternalStore(subscribe, () => multi.size);
}
