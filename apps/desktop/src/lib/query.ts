/**
 * TanStack Query wiring: one client, one key factory, live invalidation from vault change
 * events, and optimistic task mutations with an Undo toast.
 */
import { MutationCache, QueryClient, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  createTask,
  hostRestore,
  hostTaskDelete,
  taskCancel,
  taskClaim,
  taskFinish,
  taskRelease,
  taskReopen,
  taskUpdate,
  type TaskNewArgs,
  type TaskUpdateArgs,
} from "./api";
import { droppedFields, inverseOf, toWire } from "./patch";
import { notSaved } from "./copy";
import { describeRecur } from "./recur";
import { dueLabel } from "./dates";
import { CallError, onVaultChanged, type ConnectionState, type VaultChange } from "./transport";
import type { Task } from "./types";

/* ------------------------------------------------------------------ client */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof CallError && !err.offline) && count < 2,
    },
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.options.meta?.silent) return;
      toast.error(err instanceof Error ? err.message : String(err));
    },
  }),
});

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

/* -------------------------------------------------------------------- keys */

export const qk = {
  tasks: {
    all: ["tasks"] as const,
    list: (args: object = {}) => ["tasks", "list", args] as const,
    detail: (id: string) => ["tasks", "detail", id] as const,
  },
  notes: {
    all: ["notes"] as const,
    list: (args: object = {}) => ["notes", "list", args] as const,
    detail: (id: string) => ["notes", "detail", id] as const,
    files: ["notes", "files"] as const,
    file: (path: string) => ["notes", "file", path] as const,
  },
  memories: {
    all: ["memories"] as const,
    list: (args: object = {}) => ["memories", "list", args] as const,
    recall: (query: string, args: object = {}) => ["memories", "recall", query, args] as const,
    detail: (id: string) => ["memories", "detail", id] as const,
  },
  scratch: {
    all: ["scratch"] as const,
    list: (args: object = {}) => ["scratch", "list", args] as const,
    detail: (agent: string, name: string) => ["scratch", "detail", agent, name] as const,
  },
  graph: {
    all: ["graph"] as const,
    neighbors: (id: string) => ["graph", "neighbors", id] as const,
  },
  assets: {
    all: ["assets"] as const,
    list: (args: object = {}) => ["assets", "list", args] as const,
  },
  search: (args: object) => ["search", args] as const,
  activity: (args: object = {}) => ["activity", args] as const,
  host: {
    all: ["host"] as const,
    status: ["host", "status"] as const,
    members: ["host", "members"] as const,
    projects: ["host", "projects"] as const,
    dashboard: ["host", "dashboard"] as const,
    /** Feature probes for optional host tools. */
    caps: ["host", "caps"] as const,
  },
};

/** Which cache roots a change in each space invalidates. */
const SPACE_KEYS: Record<string, QueryKey[]> = {
  tasks: [qk.tasks.all, qk.host.projects, qk.host.members, qk.host.status, ["search"], ["activity"], qk.graph.all],
  notes: [qk.notes.all, qk.host.projects, qk.host.status, ["search"], ["activity"], qk.graph.all],
  memories: [qk.memories.all, qk.host.members, qk.host.status, ["search"], ["activity"], qk.graph.all],
  scratch: [qk.scratch.all, qk.host.members, qk.host.status, ["activity"]],
  assets: [qk.assets.all, qk.host.status, ["search"]],
};

/** Invalidate the caches for the given spaces (all caches when the list is empty/unknown). */
export function invalidateSpaces(spaces: string[], client: QueryClient = queryClient) {
  const known = spaces.filter((s) => s in SPACE_KEYS);
  if (!known.length) {
    void client.invalidateQueries();
    return;
  }
  const seen = new Set<string>();
  for (const s of known) {
    for (const key of SPACE_KEYS[s]) {
      const id = JSON.stringify(key);
      if (seen.has(id)) continue;
      seen.add(id);
      void client.invalidateQueries({ queryKey: key });
    }
  }
}

/* ------------------------------------------------------- connection state */

let connection: ConnectionState = "connecting";
const connListeners = new Set<() => void>();
function setConnection(s: ConnectionState) {
  if (s === connection) return;
  connection = s;
  for (const l of connListeners) l();
}

/** Live/offline state of the vault change channel (sidebar indicator). */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    (cb) => {
      connListeners.add(cb);
      return () => connListeners.delete(cb);
    },
    () => connection,
  );
}

/**
 * Subscribe once (in the app shell) to vault change events and invalidate by space.
 * Events are batched over 120 ms so a burst of writes refetches once.
 */
export function useVaultEvents() {
  const client = useQueryClient();
  useEffect(() => {
    let pending = new Set<string>();
    let all = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      invalidateSpaces(all ? [] : [...pending], client);
      pending = new Set();
      all = false;
    };
    let openedOnce = false;
    const unsub = onVaultChanged(
      (e: VaultChange) => {
        if (!e.spaces?.length) all = true;
        for (const s of e.spaces ?? []) pending.add(s);
        if (!timer) timer = setTimeout(flush, 120);
      },
      (s) => {
        const was = connection;
        setConnection(s);
        if (s !== "live" || was === "live") return;
        // Every (re)connect after the first: whatever changed while the stream was down is
        // unknown, whether the gap showed as "offline" or only as "connecting".
        if (openedOnce) void client.invalidateQueries();
        openedOnce = true;
      },
    );
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [client]);
}

/* ------------------------------------------------------------- undo toast */

type UndoFn = () => Promise<unknown> | unknown;
interface UndoEntry {
  fn: UndoFn;
  at: number;
  toastId?: string | number;
  /** Set once the undo ran (toast button or ⌘Z); later clicks are ignored. */
  used: boolean;
}
let lastUndo: UndoEntry | null = null;

/** Show a toast with an Undo action. The latest undo is also reachable via ⌘Z (`runLastUndo`). */
export function toastWithUndo(message: string, undo?: UndoFn, opts: { description?: string } = {}) {
  if (!undo) {
    toast.success(message, { description: opts.description });
    return;
  }
  const entry: UndoEntry = { fn: undo, at: Date.now(), used: false };
  lastUndo = entry;
  entry.toastId = toast(message, {
    description: opts.description,
    duration: 7000,
    action: {
      label: "Undo",
      onClick: () => void runUndo(entry),
    },
  });
}

async function runUndo(entry: UndoEntry) {
  if (entry.used) return;
  entry.used = true;
  if (lastUndo === entry) lastUndo = null;
  // Replace the original toast (and its Undo button) in place, so it cannot run twice.
  const id = entry.toastId;
  toast.loading("Undoing…", { id, action: undefined, description: undefined });
  try {
    await entry.fn();
    toast.success("Undone", { id, duration: 2000, action: undefined, description: undefined });
  } catch (e) {
    toast.error(`Undo failed: ${e instanceof Error ? e.message : String(e)}`, { id, action: undefined });
  } finally {
    invalidateSpaces([]);
  }
}

/** Run the most recent undo (within 30 s). Returns false when there is nothing to undo. */
export function runLastUndo(): boolean {
  if (!lastUndo || lastUndo.used || Date.now() - lastUndo.at > 30_000) return false;
  void runUndo(lastUndo);
  return true;
}

/* ------------------------------------------------- optimistic task caches */

type Snapshot = [QueryKey, unknown][];

/** Patch a task in every cached list/detail. `fn` returns null to drop it from lists. */
export async function patchTaskCaches(
  client: QueryClient,
  id: string,
  fn: (t: Task) => Task | null,
): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: qk.tasks.all });
  const snap: Snapshot = client.getQueriesData({ queryKey: qk.tasks.all });
  for (const [key, data] of snap) {
    if (Array.isArray(data)) {
      const next: Task[] = [];
      let changed = false;
      for (const t of data as Task[]) {
        if (t.id !== id) next.push(t);
        else {
          changed = true;
          const p = fn(t);
          if (p) next.push(p);
        }
      }
      if (changed) client.setQueryData(key, next);
    } else if (data && typeof data === "object" && (data as Task).id === id) {
      const p = fn(data as Task);
      if (p) client.setQueryData(key, p);
    }
  }
  return snap;
}

/** Insert a freshly created task into cached lists whose filters would plausibly include it. */
function insertTaskCaches(client: QueryClient, task: Task) {
  for (const [key, data] of client.getQueriesData<Task[]>({ queryKey: ["tasks", "list"] })) {
    if (!Array.isArray(data) || data.some((t) => t.id === task.id)) continue;
    const args = (key[2] ?? {}) as { status?: string; project?: string; tags?: string[]; parent?: string; section?: string };
    if (args.status && !args.status.split(",").includes(task.status)) continue;
    if (args.project && args.project !== task.project) continue;
    if (args.parent && args.parent !== task.parent) continue;
    if (args.section && args.section !== task.section) continue;
    if (args.tags?.length && !args.tags.every((t) => task.tags.includes(t))) continue;
    client.setQueryData(key, [...data, task]);
  }
}

function restore(client: QueryClient, snap: Snapshot | undefined) {
  if (!snap) return;
  for (const [key, data] of snap) client.setQueryData(key, data);
}

const settle = (client: QueryClient) => () => void client.invalidateQueries({ queryKey: qk.tasks.all });

/**
 * The inverse update for an update: previous values of every field the update touches, in
 * wire form (`""` clears a field that was unset before; the core reads `null` as "not sent").
 */
export function inverseUpdate(before: Task, args: TaskUpdateArgs): TaskUpdateArgs {
  return inverseOf(before, args);
}

/** Apply an update's fields to a task object (optimistic preview). Tag specs are interpreted. */
export function applyUpdate(t: Task, args: TaskUpdateArgs): Task {
  const next = { ...t } as Task & Record<string, unknown>;
  for (const [k, v] of Object.entries(args)) {
    if (k === "tags" || v === undefined) continue;
    next[k] = v;
  }
  if (typeof args.tags === "string") next.tags = applyTagSpec(t.tags, args.tags);
  return next;
}

export function applyTagSpec(tags: string[], spec: string): string[] {
  const s = spec.trim();
  if (s.startsWith("=")) return s.slice(1).split(",").map((x) => x.trim()).filter(Boolean);
  const out = [...tags];
  for (const raw of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    if (raw.startsWith("-")) {
      const i = out.indexOf(raw.slice(1));
      if (i >= 0) out.splice(i, 1);
    } else {
      const v = raw.replace(/^\+/, "");
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

/* ------------------------------------------------------- mutation hooks */

/** Complete a task (optimistic, Undo → reopen). Recurring tasks report the next due. */
export function useCompleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (t: Task) => taskFinish(t.id),
    onMutate: async (t) => ({
      snap: await patchTaskCaches(client, t.id, (x) =>
        x.recur ? x : { ...x, status: "done", completed: new Date().toISOString() },
      ),
    }),
    onError: (_e, _t, ctx) => restore(client, ctx?.snap),
    onSuccess: (res, t) => {
      const next = res?.next_due ?? (t.recur && res?.due !== t.due ? res?.due : null);
      const desc = next ? `Next: ${dueLabel(next)} · ${describeRecur(t.recur, t.recur_from)}` : undefined;
      // A recurring finish keeps the task open and moves `due` (and `deadline`) forward, so
      // Undo puts the old dates back and drops `completed` (`status: open` on an open task).
      const undo = t.recur
        ? () =>
            taskUpdate(t.id, {
              status: "open",
              due: t.due ?? "",
              deadline: t.deadline ?? "",
            } as TaskUpdateArgs)
        : () => taskReopen(t.id);
      toastWithUndo(`Completed “${t.title}”`, undo, { description: desc });
    },
    onSettled: settle(client),
  });
}

/** Reopen a done task (v2 `status: open`). */
export function useReopenTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (t: Task) => taskReopen(t.id),
    onMutate: async (t) => ({ snap: await patchTaskCaches(client, t.id, (x) => ({ ...x, status: "open", completed: null })) }),
    onError: (_e, _t, ctx) => restore(client, ctx?.snap),
    onSettled: settle(client),
  });
}

/** Update fields of a task (optimistic). `undoable` shows an Undo toast restoring old values. */
export function useUpdateTask(opts: { undoable?: boolean; message?: (t: Task) => string } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, args }: { task: Task; args: TaskUpdateArgs }) => taskUpdate(task.id, toWire(args) as TaskUpdateArgs),
    onMutate: async ({ task, args }) => ({ snap: await patchTaskCaches(client, task.id, (x) => applyUpdate(x, args)) }),
    onError: (_e, _v, ctx) => restore(client, ctx?.snap),
    onSuccess: (res, { task, args }) => {
      const dropped = droppedFields(toWire(args), res);
      if (dropped.length) toast.warning(notSaved(dropped));
      if (opts.undoable) {
        const inv = inverseUpdate(task, args);
        toastWithUndo(opts.message?.(task) ?? `Updated “${task.title}”`, () => taskUpdate(task.id, inv));
      }
    },
    onSettled: settle(client),
  });
}

/** Delete a task through `host_task_delete`; Undo writes the raw bytes back (`host_restore`). */
export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (t: Task) => hostTaskDelete(t.id),
    onMutate: async (t) => ({ snap: await patchTaskCaches(client, t.id, () => null) }),
    onError: (_e, _t, ctx) => restore(client, ctx?.snap),
    onSuccess: (file, t) => toastWithUndo(`Deleted “${t.title}”`, () => hostRestore(file)),
    onSettled: settle(client),
  });
}

/** Cancel a task (terminal, moves to done/). */
export function useCancelTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, reason }: { task: Task; reason?: string }) => taskCancel(task.id, reason),
    onMutate: async ({ task }) => ({ snap: await patchTaskCaches(client, task.id, (x) => ({ ...x, status: "cancelled" })) }),
    onError: (_e, _v, ctx) => restore(client, ctx?.snap),
    onSuccess: (_r, { task }) => toastWithUndo(`Cancelled “${task.title}”`, () => taskReopen(task.id)),
    onSettled: settle(client),
  });
}

/** Claim / release (agent delegation). */
export function useClaimTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, claimer, release }: { task: Task; claimer?: string; release?: boolean }) =>
      release ? taskRelease(task.id, claimer) : taskClaim(task.id, { claimer }),
    onMutate: async ({ task, claimer, release }) => ({
      snap: await patchTaskCaches(client, task.id, (x) =>
        release ? { ...x, status: "open", claimed_by: null } : { ...x, status: "claimed", claimed_by: claimer ?? x.claimed_by },
      ),
    }),
    onError: (_e, _v, ctx) => restore(client, ctx?.snap),
    onSettled: settle(client),
  });
}

/** Create a task (v1-safe, see `createTask`), insert it into caches, toast with Undo (delete). */
export function useCreateTask(opts: { quiet?: boolean } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: TaskNewArgs) => createTask(args),
    onSuccess: ({ task, warnings }) => {
      insertTaskCaches(client, task);
      for (const w of warnings) toast.warning(w);
      if (!opts.quiet) toastWithUndo(`Added “${task.title}”`, () => hostTaskDelete(task.id));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks.all });
      void client.invalidateQueries({ queryKey: qk.host.projects });
    },
  });
}
