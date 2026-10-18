/**
 * Detail pane state + renderer registry.
 *
 * State lives in the URL (`?open=task:t-abc`) so deep links and reloads work and navigating to
 * another view closes the pane. Opening/closing replaces the history entry (no Back-button spam). Feature modules register a renderer per kind:
 *
 *   registerDetailRenderer("task", TaskDetail)   // components/task/TaskDetail.tsx
 *
 * The shell draws the pane (right column on wide windows, a sheet on narrow ones) and falls
 * back to a minimal read-only view when no renderer is registered for a kind.
 */
import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from "react";
import { setRouteQuery, useRouteQuery } from "@/lib/router";

export type DetailKind = "task" | "note" | "memory" | "scratch" | "agent" | "project";

export interface DetailTarget {
  kind: DetailKind;
  /** Entity id; for scratch use `agent/name`. */
  id: string;
}

export interface DetailRendererProps {
  target: DetailTarget;
  id: string;
  onClose: () => void;
}

export type DetailRenderer = ComponentType<DetailRendererProps>;

/* -------------------------------------------------------------- registry */

const renderers = new Map<DetailKind, DetailRenderer>();
const listeners = new Set<() => void>();
let version = 0;

/** Register (or replace) the pane renderer for a kind. Call at module top level. */
export function registerDetailRenderer(kind: DetailKind, renderer: DetailRenderer) {
  if (renderers.get(kind) === renderer) return;
  renderers.set(kind, renderer);
  version++;
  for (const l of listeners) l();
}

export function useDetailRenderer(kind: DetailKind | undefined): DetailRenderer | undefined {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return kind ? renderers.get(kind) : undefined;
}

/* ----------------------------------------------------------------- state */

export function encodeTarget(t: DetailTarget): string {
  return `${t.kind}:${t.id}`;
}

export function decodeTarget(s: string | null): DetailTarget | null {
  if (!s) return null;
  const i = s.indexOf(":");
  if (i <= 0) return null;
  const kind = s.slice(0, i) as DetailKind;
  const id = s.slice(i + 1);
  return id ? { kind, id } : null;
}

export function openDetail(t: DetailTarget) {
  setRouteQuery({ open: encodeTarget(t) });
}

export function closeDetail() {
  setRouteQuery({ open: null });
}

/** Imperative helpers usable outside React (palette, hotkeys). */
export const openTask = (id: string) => openDetail({ kind: "task", id });

export interface DetailApi {
  target: DetailTarget | null;
  isOpen: (kind: DetailKind, id: string) => boolean;
  open: (t: DetailTarget) => void;
  openTask: (id: string) => void;
  close: () => void;
  toggleTask: (id: string) => void;
}

/** `const { target, openTask, close } = useDetail()` in views. */
export function useDetail(): DetailApi {
  const q = useRouteQuery();
  const raw = q.get("open");
  const target = useMemo(() => decodeTarget(raw), [raw]);
  const isOpen = useCallback((kind: DetailKind, id: string) => target?.kind === kind && target.id === id, [target]);
  const toggleTask = useCallback(
    (id: string) => (target?.kind === "task" && target.id === id ? closeDetail() : openTask(id)),
    [target],
  );
  return useMemo(
    () => ({ target, isOpen, open: openDetail, openTask, close: closeDetail, toggleTask }),
    [target, isOpen, toggleTask],
  );
}
