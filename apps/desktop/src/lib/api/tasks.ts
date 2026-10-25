/**
 * Typed wrappers for the task tools (`src/mcp/schema.rs`). Argument names match the MCP
 * schema exactly: `shards_task_get` takes `id`, every verb takes `task_id`.
 * v2 fields (`due`, `deadline`, `recur`, `recur_from`, `parent`, `section`, `order`, `status`)
 * are passed through; the core ignores keys it does not know yet.
 */
import { CallError } from "../transport";
import { notSaved } from "../copy";
import type { Priority, RecurFrom, Task, TaskStatus } from "../types";
import { ALL, invokeTool } from "./util";

export interface TaskListArgs {
  /** Comma-separated, e.g. `"open,claimed"`. */
  status?: string;
  owner?: string;
  mine?: boolean;
  tags?: string[];
  any_tag?: boolean;
  project?: string;
  since?: string;
  stale?: string;
  available?: boolean;
  ready?: boolean;
  blocked?: boolean;
  sort?: string;
  /** Defaults to {@link ALL} here (the core's default is 20). */
  limit?: number;
  /* task-model-v2 filters */
  due_before?: string;
  due_after?: string;
  overdue?: boolean;
  parent?: string;
  section?: string;
}

/** v2 fields the UI may set. `null` clears a field (when the core supports clearing). */
export interface TaskV2Fields {
  due?: string | null;
  deadline?: string | null;
  recur?: string | null;
  recur_from?: RecurFrom | null;
  parent?: string | null;
  section?: string | null;
  order?: number | null;
}

export interface TaskNewArgs extends TaskV2Fields {
  title: string;
  priority?: Priority;
  tags?: string[];
  owner?: string;
  body?: string;
  project?: string;
  blocks?: string[];
  blocked_by?: string[];
}

export interface TaskUpdateArgs extends TaskV2Fields {
  priority?: Priority;
  /** Tag-spec string (see `tagSpec`), not a list. */
  tags?: string;
  title?: string;
  project?: string;
  owner?: string;
  blocks?: string[];
  blocked_by?: string[];
  /** v2: `open` reopens a done task (clears `completed`). */
  status?: TaskStatus;
}

export const taskList = (args: TaskListArgs = {}) =>
  invokeTool<Task[]>("shards_task_list", { limit: ALL, ...args });

export const taskGet = (id: string) => invokeTool<Task>("shards_task_get", { id });

export const taskNew = (args: TaskNewArgs) => invokeTool<Task>("shards_task_new", args);

export const taskUpdate = (task_id: string, args: TaskUpdateArgs) =>
  invokeTool<Task>("shards_task_update", { task_id, ...args });

export const taskAppend = (task_id: string, text: string, opts: { section?: string; timestamp?: boolean } = {}) =>
  invokeTool<Task>("shards_task_append", { task_id, text, ...opts });

export const taskClaim = (task_id: string, opts: { claimer?: string; strict?: boolean } = {}) =>
  invokeTool<Task>("shards_task_claim", { task_id, ...opts });

export const taskRelease = (task_id: string, owner?: string) =>
  invokeTool<Task>("shards_task_release", { task_id, owner });

export const taskFinish = (task_id: string, outcome?: string) =>
  invokeTool<Task>("shards_task_finish", { task_id, outcome });

export const taskCancel = (task_id: string, reason?: string) =>
  invokeTool<Task>("shards_task_cancel", { task_id, reason });

export const taskBlock = (task_id: string, on: string[]) => invokeTool<Task>("shards_task_block", { task_id, on });

export const taskUnblock = (task_id: string, opts: { on?: string[]; all?: boolean }) =>
  invokeTool<Task>("shards_task_unblock", { task_id, ...opts });

export const taskNext = (opts: { claim?: boolean; strict?: boolean; mine?: boolean; project?: string; tags?: string[] } = {}) =>
  invokeTool<Task | null>("shards_task_next", opts);

/** Reopen a finished task (v2 `status: open`). Throws if the core silently ignored it (v1 core). */
export async function taskReopen(task_id: string): Promise<Task> {
  const t = await taskUpdate(task_id, { status: "open" });
  if (t.status !== "open") throw new CallError("unsupported", "Reopen needs a newer vault core");
  return t;
}

/* --------------------------------------------------------- composite helpers */

export const V2_KEYS = ["due", "deadline", "recur", "recur_from", "parent", "section", "order"] as const;

/** v2 fields an update asked to set (non-null) that the returned task does not carry. */
export function droppedV2Fields(args: TaskV2Fields, task: Task): string[] {
  const t = task as unknown as Record<string, unknown>;
  return V2_KEYS.filter((k) => args[k] !== undefined && args[k] !== null && t[k] == null);
}

export interface CreateTaskResult {
  task: Task;
  /** Human-readable notes about fields the core did not accept (v1 core, enum mismatch). */
  warnings: string[];
}

/**
 * Create a task robustly against a core that may not have task-model-v2 yet:
 * 1. `shards_task_new` with everything (unknown keys are ignored by a v1 core);
 *    if `priority: urgent` is refused, retry with `high`.
 * 2. For v2 fields the returned task does not carry, a follow-up `shards_task_update`.
 * A v2 rejection never loses the task; it becomes a warning.
 */
export async function createTask(input: TaskNewArgs): Promise<CreateTaskResult> {
  const warnings: string[] = [];
  let task: Task;
  try {
    task = await taskNew(input);
  } catch (e) {
    if (input.priority === "urgent" && e instanceof CallError) {
      task = await taskNew({ ...input, priority: "high" });
      warnings.push("Priority “urgent” not supported yet — saved as high.");
    } else {
      throw e;
    }
  }
  const missing: TaskV2Fields = {};
  let need = false;
  for (const k of V2_KEYS) {
    const want = input[k];
    if (want !== undefined && want !== null && (task as unknown as Record<string, unknown>)[k] == null) {
      (missing as Record<string, unknown>)[k] = want;
      need = true;
    }
  }
  if (need) {
    try {
      const updated = await taskUpdate(task.id, missing);
      task = updated;
      const still = V2_KEYS.filter((k) => missing[k] !== undefined && (task as unknown as Record<string, unknown>)[k] == null);
      if (still.length) warnings.push(notSaved(still));
    } catch {
      warnings.push(`Created, but ${Object.keys(missing).join(", ")} could not be saved.`);
    }
  }
  return { task, warnings };
}
