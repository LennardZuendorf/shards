/**
 * The create payload for "Duplicate": the source's own fields, its body, and the
 * parent/section/order triple that keeps the copy beside it. A pure builder, so the copy can be
 * asserted against the source without a host (see `actions.ts` → `duplicate`).
 */
import type { TaskNewArgs } from "@/lib/api";
import type { Priority, Task } from "@/lib/types";

/**
 * @param t    the row the menu was opened on (it carries no body)
 * @param body the detail read of the same task (`shards_task_get`), when it succeeded
 */
export function duplicateArgs(t: Task, body: string | undefined): TaskNewArgs {
  return {
    title: t.title,
    priority: (t.priority as Priority) ?? undefined,
    tags: t.tags.length ? t.tags : undefined,
    owner: t.owner ?? undefined,
    project: t.project ?? undefined,
    body: body?.trim() ? `${body.trim()}\n` : undefined,
    due: t.due ?? undefined,
    deadline: t.deadline ?? undefined,
    recur: t.recur ?? undefined,
    recur_from: t.recur ? (t.recur_from ?? "due") : undefined,
    parent: t.parent ?? undefined,
    section: t.section ?? undefined,
    order: typeof t.order === "number" ? t.order + 0.5 : undefined,
  };
}
