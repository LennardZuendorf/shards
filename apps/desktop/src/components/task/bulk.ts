/**
 * Bulk edits over the multi-selection (Shift/⌘-click, Shift+J/K): every action is one batch
 * through the same patch a single edit uses, with one Undo for the whole batch.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hostRestore, hostTaskDelete, tagSpec, taskFinish, taskReopen, taskUpdate, type TaskUpdateArgs } from "@/lib/api";
import { patchTaskCaches, qk, toastWithUndo } from "@/lib/query";
import type { Priority, Task } from "@/lib/types";
import { usePatchMany } from "./actions";
import { errorText, inverseOf, toWire } from "./patch";
import { clearMulti, multiIds, rowTask } from "./selection";

const n = (k: number) => `${k} task${k === 1 ? "" : "s"}`;

function selectedTasks(): Task[] {
  return multiIds()
    .map((id) => rowTask(id))
    .filter((t): t is Task => !!t);
}

export function useBulkActions() {
  const client = useQueryClient();
  const patchMany = usePatchMany();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: qk.tasks.all });
    void client.invalidateQueries({ queryKey: qk.host.projects });
  };

  const patch = (verb: string, argsFor: (t: Task) => TaskUpdateArgs | null) => {
    const items = selectedTasks()
      .map((task) => ({ task, args: argsFor(task) }))
      .filter((x): x is { task: Task; args: TaskUpdateArgs } => !!x.args && Object.keys(x.args).length > 0);
    if (!items.length) return;
    const undo = items.map((x) => ({ id: x.task.id, args: inverseOf(x.task, x.args) }));
    patchMany.mutate(items, {
      onSuccess: () => toastWithUndo(`${verb} ${n(items.length)}`, () => Promise.all(undo.map((u) => taskUpdate(u.id, toWire(u.args) as TaskUpdateArgs)))),
    });
    clearMulti();
  };

  const complete = useMutation({
    meta: { silent: true },
    mutationFn: (ts: Task[]) => Promise.allSettled(ts.map((t) => taskFinish(t.id))),
    onMutate: async (ts) => {
      const at = new Date().toISOString();
      for (const t of ts) if (!t.recur) await patchTaskCaches(client, t.id, (x) => ({ ...x, status: "done", completed: at }));
    },
    onSuccess: (res, ts) => {
      const done = ts.filter((_, i) => res[i]?.status === "fulfilled");
      const failed = ts.length - done.length;
      toastWithUndo(
        `Completed ${n(done.length)}`,
        () =>
          Promise.all(
            done.map((t) =>
              t.recur ? taskUpdate(t.id, { status: "open", due: t.due ?? "", deadline: t.deadline ?? "" } as TaskUpdateArgs) : taskReopen(t.id),
            ),
          ),
        failed ? { description: `${n(failed)} could not be completed.` } : undefined,
      );
    },
    onError: (e) => toast.error(`Couldn’t complete: ${errorText(e)}`),
    onSettled: invalidate,
  });

  const remove = useMutation({
    meta: { silent: true },
    mutationFn: async (ts: Task[]) => {
      const res = await Promise.allSettled(ts.map((t) => hostTaskDelete(t.id)));
      return res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    },
    onMutate: async (ts) => {
      for (const t of ts) await patchTaskCaches(client, t.id, () => null);
    },
    onSuccess: (files, ts) => {
      if (files.length < ts.length) toast.error(`${n(ts.length - files.length)} could not be deleted.`);
      if (files.length)
        toastWithUndo(`Deleted ${n(files.length)}`, async () => {
          for (const f of files) await hostRestore(f);
        });
    },
    onError: (e) => toast.error(`Couldn’t delete: ${errorText(e)}`),
    onSettled: invalidate,
  });

  return {
    schedule: (due: string | null) => patch(due ? "Scheduled" : "Removed the date from", (t) => ((t.due ?? null) === due ? null : { due })),
    setPriority: (p: Priority) => patch("Set priority on", (t) => (t.priority === p ? null : { priority: p })),
    moveTo: (project: string | null, section: string | null) =>
      patch("Moved", (t) => ((t.project ?? null) === project && (t.section ?? null) === section ? null : { project: project ?? "", section })),
    addLabel: (label: string) => patch(`Labelled @${label}:`, (t) => (t.tags.includes(label) ? null : { tags: tagSpec.add([label]) })),
    assign: (owner: string) => patch("Assigned", (t) => (t.owner === owner ? null : { owner })),
    complete: () => {
      const ts = selectedTasks().filter((t) => t.status === "open" || t.status === "claimed");
      if (ts.length) complete.mutate(ts);
      clearMulti();
    },
    remove: () => {
      const ts = selectedTasks();
      if (ts.length) remove.mutate(ts);
      clearMulti();
    },
  };
}
