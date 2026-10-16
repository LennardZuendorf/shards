/** Small view-level hooks for the task UI. */
import { useCallback, useMemo, useState } from "react";
import { guessMemberKind } from "@/lib/api/host";
import { useMe, useProjects, useTasks } from "@/lib/hooks";
import type { Project, Task } from "@/lib/types";

/** Ids of every open/claimed task (for "blocked" = a blocker still in this set). */
export function useOpenIds(): ReadonlySet<string> {
  const { data } = useTasks();
  return useMemo(() => new Set((data ?? []).map((t) => t.id)), [data]);
}

/** id → open task, for parent breadcrumbs and blocker titles. */
export function useOpenTaskMap(): ReadonlyMap<string, Task> {
  const { data } = useTasks();
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data]);
}

export function useProjectMap(): ReadonlyMap<string, Project> {
  const { data } = useProjects();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Per-viewer UI preference in localStorage (never vault data). Survives blocked storage. */
export function usePersistentState<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key, value: read(key, fallback) }));
  // Key changed (e.g. another project): re-read synchronously.
  const current = state.key === key ? state.value : read(key, fallback);
  if (state.key !== key) setState({ key, value: current });
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setState((s) => {
        const prev = s.key === key ? s.value : read(key, fallback);
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable: keep in memory */
        }
        return { key, value: next };
      });
    },
    // fallback is a literal at call sites; key drives identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [current, set];
}

/** A Set-valued persistent toggle (collapsed groups / parents). */
export function usePersistentSet(key: string): [ReadonlySet<string>, (id: string) => void] {
  const [list, setList] = usePersistentState<string[]>(key, []);
  const set = useMemo(() => new Set(list), [list]);
  const toggle = useCallback((id: string) => setList((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])), [setList]);
  return [set, toggle];
}

/**
 * The acting human: `host_status.me`, or (older hosts) the human who owns the most open tasks.
 * Used to hide "assigned to me" avatars and to label claims.
 */
export function useActingMe(): string | null {
  const me = useMe();
  const { data } = useTasks();
  return useMemo(() => {
    if (me) return me;
    const counts = new Map<string, number>();
    for (const t of data ?? []) if (t.owner && guessMemberKind(t.owner) === "human") counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
    let best: string | null = null;
    let n = 0;
    for (const [id, c] of counts) if (c > n) [best, n] = [id, c];
    return best;
  }, [me, data]);
}
