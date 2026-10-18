/**
 * Label management (rename, merge, delete, favourite). A label is only a tag on tasks, so a
 * rename or delete is a batch of task updates (the pattern section-store's `viaTasks` uses),
 * with one Undo for the whole batch. Favourites are a per-viewer preference.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { tagSpec, taskList, taskUpdate } from "@/lib/api";
import { toastWithUndo } from "@/lib/query";
import type { Task } from "@/lib/types";
import { usePatchMany } from "./actions";
import { errorText } from "./patch";

/** Every status, so a rename also reaches done and cancelled tasks. */
const EVERY_STATUS = "open,claimed,done,cancelled";

/** The tag edit that renames `from` to `to` on one task, and its inverse. */
export function renameSpec(task: Pick<Task, "tags">, from: string, to: string): { spec: string; undo: string } {
  const had = task.tags.includes(to);
  return {
    spec: had ? tagSpec.remove([from]) : `${tagSpec.remove([from])},${tagSpec.add([to])}`,
    // A task that already carried `to` keeps it on undo (it was a merge for that task).
    undo: had ? tagSpec.add([from]) : `${tagSpec.remove([to])},${tagSpec.add([from])}`,
  };
}

/** A label name as the quick-add grammar writes it: trimmed, no `@`, spaces as dashes. */
export const cleanLabel = (s: string) => s.trim().replace(/^@+/, "").replace(/\s+/g, "-");

export function useLabelActions() {
  const patchMany = usePatchMany();

  const carrying = (name: string) => taskList({ status: EVERY_STATUS, tags: [name] }).then((ts) => ts.filter((t) => t.tags.includes(name)));

  const run = async (name: string, plan: (t: Task) => { spec: string; undo: string }, message: (n: number) => string) => {
    let tasks: Task[];
    try {
      tasks = await carrying(name);
    } catch (e) {
      toast.error(`Couldn’t load tasks labelled @${name}: ${errorText(e)}`);
      return false;
    }
    if (!tasks.length) return false;
    const plans = tasks.map((t) => ({ task: t, ...plan(t) }));
    patchMany.mutate(
      plans.map((p) => ({ task: p.task, args: { tags: p.spec } })),
      {
        onSuccess: () =>
          toastWithUndo(message(tasks.length), () => Promise.all(plans.map((p) => taskUpdate(p.task.id, { tags: p.undo })))),
      },
    );
    return true;
  };

  return {
    /** Rename `from` to `to` on every task; when `to` exists this merges the two labels. */
    rename: (from: string, to: string, merge: boolean) =>
      run(from, (t) => renameSpec(t, from, to), (n) => `${merge ? "Merged" : "Renamed"} @${from} into @${to} on ${n} task${n === 1 ? "" : "s"}`),
    /** Remove the label from every task (the tasks stay). */
    remove: (name: string) =>
      run(name, () => ({ spec: tagSpec.remove([name]), undo: tagSpec.add([name]) }), (n) => `Removed @${name} from ${n} task${n === 1 ? "" : "s"}`),
  };
}

/* -------------------------------------------------------------- favourites */

const FAV_KEY = "shards.labels.favorite";
const favListeners = new Set<() => void>();
let favCache: string[] | null = null;

function readFavs(): string[] {
  if (favCache) return favCache;
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    favCache = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    favCache = [];
  }
  return favCache;
}

export function setFavoriteLabel(name: string, on: boolean) {
  const cur = readFavs();
  favCache = on ? [...cur.filter((x) => x !== name), name] : cur.filter((x) => x !== name);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favCache));
  } catch {
    /* storage unavailable: kept for this session */
  }
  favListeners.forEach((l) => l());
}

/** Favourite labels, pinned to the top of the sidebar list (per viewer). */
export function useFavoriteLabels(): string[] {
  return useSyncExternalStore(
    (cb) => {
      favListeners.add(cb);
      return () => favListeners.delete(cb);
    },
    readFavs,
  );
}
