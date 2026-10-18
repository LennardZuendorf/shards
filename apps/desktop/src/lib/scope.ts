/**
 * Whose work a personal view shows, and the one counting rule every surface shares.
 *
 * Today and Upcoming default to **Mine**: tasks the acting human owns, holds (claimed), or that
 * nobody owns — Todoist's "assigned to me or unassigned". The rest (agent-delegated work) is a
 * collapsed group at the bottom. The choice is a per-view, per-viewer preference kept in
 * browser storage; the sidebar badge reads the same preference so it matches the view.
 */
import { useSyncExternalStore } from "react";
import type { Task } from "./types";

export type TaskScope = "mine" | "everyone";
export type ScopedView = "today" | "upcoming";

/** Mine = owner is me, nobody owns it, or I hold the claim. With no known `me`, everything is mine. */
export function isMine(t: Task, me: string | null | undefined): boolean {
  if (!me) return true;
  return !t.owner || t.owner === me || t.claimed_by === me;
}

/** Split a list into mine and the rest, preserving order. */
export function splitMine<T extends Task>(tasks: readonly T[], me: string | null | undefined): { mine: T[]; others: T[] } {
  const mine: T[] = [];
  const others: T[] = [];
  for (const t of tasks) (isMine(t, me) ? mine : others).push(t);
  return { mine, others };
}

/**
 * The one counting rule for badges, headers, columns and subtitles (Todoist): top-level tasks
 * only. A subtask counts only when its parent is not in the same set — exactly when the list
 * renders it as a root.
 */
export function countTopLevel(tasks: readonly Task[]): number {
  const ids = new Set(tasks.map((t) => t.id));
  let n = 0;
  for (const t of tasks) if (!t.parent || !ids.has(t.parent)) n++;
  return n;
}

/** Open-task count per project id, by [`countTopLevel`] over each project's open tasks. */
export function projectCounts(open: readonly Task[]): Map<string, number> {
  const by = new Map<string, Task[]>();
  for (const t of open) {
    if (!t.project || (t.status !== "open" && t.status !== "claimed")) continue;
    const list = by.get(t.project);
    if (list) list.push(t);
    else by.set(t.project, [t]);
  }
  return new Map([...by].map(([id, ts]) => [id, countTopLevel(ts)]));
}

/* ------------------------------------------------------- scope preference */

const KEY = (view: ScopedView) => `shards.scope.${view}`;
const listeners = new Set<() => void>();
const memory = new Map<ScopedView, TaskScope>();

function read(view: ScopedView): TaskScope {
  const held = memory.get(view);
  if (held) return held;
  try {
    return localStorage.getItem(KEY(view)) === "everyone" ? "everyone" : "mine";
  } catch {
    return "mine";
  }
}

export function setTaskScope(view: ScopedView, scope: TaskScope) {
  memory.set(view, scope);
  try {
    localStorage.setItem(KEY(view), scope);
  } catch {
    /* storage unavailable: the in-memory value still applies this session */
  }
  listeners.forEach((l) => l());
}

/** The view's scope, shared by the view and the sidebar badge. */
export function useTaskScope(view: ScopedView): [TaskScope, (s: TaskScope) => void] {
  const scope = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(view),
  );
  return [scope, (s) => setTaskScope(view, s)];
}
