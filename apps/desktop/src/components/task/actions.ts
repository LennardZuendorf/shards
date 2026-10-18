/**
 * Task actions for rows, boards, the detail pane and keyboard shortcuts. Built on the
 * foundation's optimistic cache helpers, with core-correct clearing (`""`) and undo.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  createTask,
  hostRestore,
  taskFinish,
  hostTaskDelete,
  tagSpec,
  taskBlock,
  taskCancel,
  taskClaim,
  taskGet,
  taskRelease,
  taskReopen,
  taskUnblock,
  taskUpdate,
  type TaskUpdateArgs,
} from "@/lib/api";
import { dueLabel } from "@/lib/dates";
import { useMe } from "@/lib/hooks";
import { PRIORITY_META } from "@/lib/priority";
import {
  applyUpdate,
  patchTaskCaches,
  qk,
  toastWithUndo,
  useCompleteTask,
  useReopenTask,
} from "@/lib/query";
import type { Priority, Task } from "@/lib/types";
import { openDescendants } from "./model";
import { droppedFields, errorText, inverseOf, isUnknownTool, toPreview, toWire } from "./patch";

/** Every task the caches hold (open lists, done lists, details), one per id. */
function cachedTasks(client: QueryClient): Task[] {
  const byId = new Map<string, Task>();
  for (const [, data] of client.getQueriesData({ queryKey: qk.tasks.all })) {
    if (Array.isArray(data)) for (const t of data as Task[]) if (t && typeof t.id === "string") byId.set(t.id, t);
  }
  return [...byId.values()];
}

/** The open subtasks (any depth) of `t`, from the caches. */
export function useOpenSubtasks() {
  const client = useQueryClient();
  return useCallback((t: Task) => openDescendants(cachedTasks(client), t.id), [client]);
}

/** The cancel write (one place for the mutation, the board drop and tests). */
export const cancelTask = (t: Task) => taskCancel(t.id);

/**
 * Undo a cancel: back to the status the card had before the user acted (`before`), not to
 * "open". A done card is reopened and finished again.
 */
export async function undoCancel(before: Task): Promise<void> {
  await taskUpdate(before.id, { status: "open" });
  if (before.status === "done") await taskFinish(before.id);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Complete a parent and its open subtasks together (Todoist), as one Undo. Recurring
 * subtasks are left alone: finishing one would advance it, not close it.
 */
function useCompleteFamily() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ task, kids }: { task: Task; kids: Task[] }) => {
      await taskFinish(task.id);
      // Children after the parent: a failure leaves the parent done and the rest open, which
      // the refetch shows; nothing is half-written.
      return Promise.allSettled(kids.map((k) => taskFinish(k.id)));
    },
    onMutate: async ({ task, kids }) => {
      const at = new Date().toISOString();
      let first: Snapshot | undefined;
      for (const t of [task, ...kids]) {
        const s = await patchTaskCaches(client, t.id, (x) => ({ ...x, status: "done", completed: at }));
        first ??= s;
      }
      return { snap: first };
    },
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(`Couldn’t complete: ${errorText(e)}`);
    },
    onSuccess: (results, { task, kids }) => {
      const done = kids.filter((_, i) => results[i]?.status === "fulfilled");
      const failed = kids.length - done.length;
      toastWithUndo(
        `Completed “${task.title}” and ${plural(done.length, "subtask")}`,
        () => Promise.all([task, ...done].map((t) => taskReopen(t.id))),
        failed ? { description: `${plural(failed, "subtask")} could not be completed.` } : undefined,
      );
    },
    onSettled: () => invalidate(client),
  });
}

/* ------------------------------------------------- delete with subtasks */

type DeleteRequest = { task: Task; kids: Task[]; run: (withKids: boolean) => void } | null;
let pendingDelete: DeleteRequest = null;
const deleteListeners = new Set<() => void>();
function setPendingDelete(r: DeleteRequest) {
  pendingDelete = r;
  deleteListeners.forEach((l) => l());
}

/** The delete waiting for the subtask confirmation (rendered once by `DeleteTaskConfirm`). */
export function usePendingDelete(): [DeleteRequest, (r: DeleteRequest) => void] {
  const r = useSyncExternalStore(
    (cb) => {
      deleteListeners.add(cb);
      return () => deleteListeners.delete(cb);
    },
    () => pendingDelete,
  );
  return [r, setPendingDelete];
}

type Snapshot = [QueryKey, unknown][];

function restoreSnap(client: QueryClient, snap: Snapshot | undefined) {
  if (!snap) return;
  for (const [key, data] of snap) client.setQueryData(key, data);
}

function invalidate(client: QueryClient) {
  void client.invalidateQueries({ queryKey: qk.tasks.all });
  void client.invalidateQueries({ queryKey: qk.host.projects });
}

export interface PatchVars {
  task: Task;
  args: TaskUpdateArgs;
  /** Toast with Undo restoring the touched fields. */
  undo?: string;
}

/** Optimistic `shards_task_update` with `""`-clearing and an optional Undo toast. */
export function usePatchTask() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ task, args }: PatchVars) => taskUpdate(task.id, toWire(args) as TaskUpdateArgs),
    onMutate: async ({ task, args }) => ({
      snap: await patchTaskCaches(client, task.id, (x) => applyUpdate(x, toPreview(args))),
    }),
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(`Couldn’t update task: ${errorText(e)}`);
    },
    onSuccess: (res, { task, args, undo }) => {
      const dropped = droppedFields(toWire(args), res);
      if (dropped.length) toast.warning(`Not saved: ${dropped.join(", ")} (this vault’s core is too old).`);
      if (undo) {
        const inv = inverseOf(task, args);
        toastWithUndo(undo, () => taskUpdate(task.id, toWire(inv) as TaskUpdateArgs));
      }
    },
    onSettled: () => invalidate(client),
  });
}

/** Several updates at once (drag & drop reorder): one optimistic pass, parallel writes. */
export function usePatchMany() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (items: { task: Task; args: TaskUpdateArgs }[]) =>
      Promise.all(items.map(({ task, args }) => taskUpdate(task.id, toWire(args) as TaskUpdateArgs))),
    onMutate: async (items) => {
      let first: Snapshot | undefined;
      for (const { task, args } of items) {
        const s = await patchTaskCaches(client, task.id, (x) => applyUpdate(x, toPreview(args)));
        first ??= s;
      }
      return { snap: first };
    },
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(`Couldn’t move task: ${errorText(e)}`);
    },
    onSettled: () => invalidate(client),
  });
}

/** Delete via `host_task_delete`; Undo writes the bytes back. Friendly message on old hosts. */
export function useRemoveTask() {
  const client = useQueryClient();
  const cancel = useMutation({
    mutationFn: (t: Task) => taskCancel(t.id),
    onSettled: () => invalidate(client),
  });
  return useMutation({
    meta: { silent: true },
    mutationFn: (t: Task) => hostTaskDelete(t.id),
    onMutate: async (t) => ({ snap: await patchTaskCaches(client, t.id, () => null) }),
    onError: (e, t, ctx) => {
      restoreSnap(client, ctx?.snap);
      if (isUnknownTool(e)) {
        toast.error("Delete isn’t available on this Shards host yet", {
          description: "It needs host_task_delete. You can cancel the task instead.",
          action: { label: "Cancel task", onClick: () => cancel.mutate(t) },
        });
      } else toast.error(`Couldn’t delete: ${errorText(e)}`);
    },
    onSuccess: (file, t) => toastWithUndo(`Deleted “${t.title}”`, () => hostRestore(file)),
    onSettled: () => invalidate(client),
  });
}

/**
 * Delete a parent with its open subtasks. Every file's raw bytes go into one Undo entry, so
 * Undo (or ⌘Z) restores the whole family, parent first.
 */
function useRemoveFamily() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ task, kids }: { task: Task; kids: Task[] }) => {
      // Children first: if the parent's delete fails, no subtask was orphaned by it.
      const kidFiles = await Promise.all(kids.map((k) => hostTaskDelete(k.id)));
      try {
        const parent = await hostTaskDelete(task.id);
        return [parent, ...kidFiles];
      } catch (e) {
        await Promise.allSettled(kidFiles.map((f) => hostRestore(f)));
        throw e;
      }
    },
    onMutate: async ({ task, kids }) => {
      let first: Snapshot | undefined;
      for (const t of [task, ...kids]) {
        const s = await patchTaskCaches(client, t.id, () => null);
        first ??= s;
      }
      return { snap: first };
    },
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(`Couldn’t delete: ${errorText(e)}`);
    },
    onSuccess: (files, { task, kids }) =>
      toastWithUndo(`Deleted “${task.title}” and ${plural(kids.length, "subtask")}`, async () => {
        for (const f of files) await hostRestore(f);
      }),
    onSettled: () => invalidate(client),
  });
}

/** Everything a row / card / detail needs, bound to the acting identity. */
export function useTaskActions() {
  const client = useQueryClient();
  const me = useMe();
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const patch = usePatchTask();
  const remove = useRemoveTask();
  const completeFamily = useCompleteFamily();
  const removeFamily = useRemoveFamily();
  const subtasksOf = useOpenSubtasks();

  const claim = useMutation({
    meta: { silent: true },
    mutationFn: ({ task, release }: { task: Task; release?: boolean }) =>
      // Releasing someone else's claim acts as the claimer: locally identity is a spelling
      // convention, and the core refuses a release by anyone but the holder.
      release ? taskRelease(task.id, task.claimed_by ?? undefined) : taskClaim(task.id, me ? { claimer: me } : {}),
    onMutate: async ({ task, release }) => ({
      snap: await patchTaskCaches(client, task.id, (x) =>
        release ? { ...x, status: "open", claimed_by: null } : { ...x, status: "claimed", claimed_by: me ?? x.claimed_by ?? "me" },
      ),
    }),
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(errorText(e));
    },
    onSuccess: (res, { task, release }) => {
      if (release) toast.success(`Released “${task.title}”`);
      else {
        const open = res.blocked_by_unsatisfied?.length ?? 0;
        toast.success(`Claimed “${task.title}”`, open ? { description: `${open} blocker${open > 1 ? "s" : ""} still open` } : undefined);
      }
    },
    onSettled: () => invalidate(client),
  });

  const cancel = useMutation({
    meta: { silent: true },
    // `before` is the card as the user saw it (a done card dropped on Cancelled is reopened
    // first, so `t` is already open by then); Undo restores that status.
    mutationFn: ({ t }: { t: Task; before?: Task }) => cancelTask(t),
    onMutate: async ({ t }) => ({ snap: await patchTaskCaches(client, t.id, (x) => ({ ...x, status: "cancelled" })) }),
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(errorText(e));
    },
    onSuccess: (_r, { t, before }) => toastWithUndo(`Cancelled “${t.title}”`, () => undoCancel(before ?? t)),
    onSettled: () => invalidate(client),
  });

  const deps = useMutation({
    meta: { silent: true },
    mutationFn: ({ task, on, unblock }: { task: Task; on: string; unblock?: boolean }) =>
      unblock ? taskUnblock(task.id, { on: [on] }) : taskBlock(task.id, [on]),
    onMutate: async ({ task, on, unblock }) => ({
      snap: await patchTaskCaches(client, task.id, (x) => ({
        ...x,
        blocked_by: unblock ? x.blocked_by.filter((b) => b !== on) : [...new Set([...x.blocked_by, on])],
      })),
    }),
    onError: (e, _v, ctx) => {
      restoreSnap(client, ctx?.snap);
      toast.error(errorText(e));
    },
    onSettled: () => invalidate(client),
  });

  return useMemo(() => {
    const update = (task: Task, args: TaskUpdateArgs, undo?: string) => patch.mutate({ task, args, undo });
    return {
      me,
      pending: patch.isPending,
      toggleComplete: (t: Task) => {
        if (t.status === "done" || t.status === "cancelled") return reopen.mutate(t);
        const kids = t.recur ? [] : subtasksOf(t).filter((k) => !k.recur);
        if (kids.length) completeFamily.mutate({ task: t, kids });
        else complete.mutate(t);
      },
      /** Completes open subtasks with a one-off parent (one Undo restores all of them). */
      complete: (t: Task, onSettled?: () => void, onError?: () => void) => {
        const kids = t.recur ? [] : subtasksOf(t).filter((k) => !k.recur);
        if (kids.length) completeFamily.mutate({ task: t, kids }, { onSettled, onError });
        else complete.mutate(t, { onSettled, onError });
      },
      reopen: (t: Task) => reopen.mutate(t),
      update,
      rename: (t: Task, title: string) => {
        const v = title.replace(/\s+/g, " ").trim();
        if (v && v !== t.title) update(t, { title: v });
      },
      setPriority: (t: Task, p: Priority) => {
        if (t.priority !== p) update(t, { priority: p });
      },
      schedule: (t: Task, due: string | null) => {
        if ((t.due ?? null) === due) return;
        update(t, { due }, due ? `Scheduled for ${dueLabel(due)}` : "Due date removed");
      },
      setDeadline: (t: Task, deadline: string | null) => update(t, { deadline }),
      setRecur: (t: Task, recur: string | null, recurFrom?: "due" | "completion" | null) =>
        update(t, recur ? { recur, recur_from: recurFrom ?? "due" } : { recur: null, recur_from: null }),
      moveTo: (t: Task, project: string | null, section: string | null = null, label?: string) =>
        update(t, { project: project ?? "", section }, `Moved to ${label ?? (project ? project : "Inbox")}`),
      setSection: (t: Task, section: string | null) => update(t, { section }),
      setLabels: (t: Task, labels: string[]) => {
        const spec = tagSpec.diff(t.tags, labels);
        if (spec) update(t, { tags: spec });
      },
      setOwner: (t: Task, owner: string) => {
        if (owner && owner !== t.owner) update(t, { owner }, `Assigned to ${owner}`);
      },
      claim: (t: Task) => claim.mutate({ task: t }),
      /** Done/cancelled → claimed: reopen first, then claim (never in parallel). */
      reopenAndClaim: async (t: Task) => {
        try {
          await taskReopen(t.id);
          claim.mutate({ task: { ...t, status: "open", completed: null } });
        } catch (e) {
          toast.error(errorText(e));
          invalidate(client);
        }
      },
      release: (t: Task) => claim.mutate({ task: t, release: true }),
      /** `before`: the status to restore on Undo when `t` is no longer what the user saw. */
      cancel: (t: Task, before?: Task) => cancel.mutate({ t, before }),
      /** A parent with open subtasks asks first (`DeleteTaskConfirm`); the rest delete at once. */
      remove: (t: Task) => {
        const kids = subtasksOf(t);
        if (!kids.length) return remove.mutate(t);
        setPendingDelete({
          task: t,
          kids,
          run: (withKids) => (withKids ? removeFamily.mutate({ task: t, kids }) : remove.mutate(t)),
        });
      },
      block: (t: Task, on: string) => deps.mutate({ task: t, on }),
      unblock: (t: Task, on: string) => deps.mutate({ task: t, on, unblock: true }),
      duplicate: async (t: Task) => {
        try {
          const full = await taskGet(t.id).catch(() => t);
          const { task } = await createTask({
            title: t.title,
            priority: (t.priority as Priority) ?? undefined,
            tags: t.tags.length ? t.tags : undefined,
            owner: t.owner ?? undefined,
            project: t.project ?? undefined,
            body: full.body?.trim() ? `${full.body.trim()}\n` : undefined,
            due: t.due ?? undefined,
            deadline: t.deadline ?? undefined,
            recur: t.recur ?? undefined,
            recur_from: t.recur ? (t.recur_from ?? "due") : undefined,
            parent: t.parent ?? undefined,
            section: t.section ?? undefined,
            order: typeof t.order === "number" ? t.order + 0.5 : undefined,
          });
          invalidate(client);
          toastWithUndo(`Duplicated “${t.title}”`, () => hostTaskDelete(task.id));
          return task;
        } catch (e) {
          toast.error(`Couldn’t duplicate: ${errorText(e)}`);
          return null;
        }
      },
    };
  }, [me, patch, reopen, complete, claim, cancel, remove, deps, client, completeFamily, removeFamily, subtasksOf]);
}

export type TaskActions = ReturnType<typeof useTaskActions>;

export const priorityLabel = (p: Priority) => `${PRIORITY_META[p].short} · ${PRIORITY_META[p].label}`;
