/** D4 delegation model helpers: who is working on a task and in which session state. */
import { parseComments, splitBody, type Comment } from "@/components/task/model";
import type { AgentSessionState, Member, Task } from "./types";

export const NEEDS_INPUT_LABELS = ["needs-input", "awaiting-input"];
export const ERROR_LABELS = ["error", "agent-error", "failed"];

/**
 * Session state for an agent-owned or agent-claimed task:
 * done/cancelled → done; error label → error; `needs-input` label or blocked → awaiting;
 * claimed → working; otherwise idle.
 */
export function sessionState(t: Task): AgentSessionState {
  if (t.status === "done" || t.status === "cancelled") return "done";
  if (t.tags.some((x) => ERROR_LABELS.includes(x))) return "error";
  if (t.tags.some((x) => NEEDS_INPUT_LABELS.includes(x))) return "awaiting";
  if (t.status === "claimed") return t.blocked_by.length && t.ready === false ? "awaiting" : "working";
  return "idle";
}

export const SESSION_LABEL: Record<AgentSessionState, string> = {
  working: "Working",
  awaiting: "Awaiting input",
  done: "Done",
  error: "Error",
  idle: "Idle",
};

/** "In progress · claude-code" for claimed tasks (DECISIONS: claimed display). */
export function statusLabel(t: Task, members?: Map<string, Member>): string {
  switch (t.status) {
    case "claimed": {
      const who = t.claimed_by ? (members?.get(t.claimed_by)?.name ?? t.claimed_by) : null;
      return who ? `In progress · ${who}` : "In progress";
    }
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
    default:
      return "Open";
  }
}

/* --------------------------------------------------------- waiting on me (R39) */

/** Why a row waits: the agent asked for input, reported a failure, or sits behind the operator. */
export type WaitKind = "needs-input" | "error" | "blocked";

export interface WaitingTask {
  task: Task;
  kind: WaitKind;
  /** RFC 3339. Null only when the task carries neither a stamp nor `updated`. */
  since: string | null;
  /** The identity that asked (the stamp's actor); the claimant/owner when the wait falls back to `updated`. */
  agent: string | null;
  /** The stamped question or failure text; null when the wait falls back to `updated`. */
  message: string | null;
  /** The open blocker assigned to the operator, for a `blocked` row. */
  blocker: Task | null;
}

export interface WaitingOptions {
  /** Task body by id (`shards_task_get`): the stamp and its text live there, not in the list payload. */
  bodies?: ReadonlyMap<string, string | null | undefined>;
  /** Project ids kept out of the queue — archived projects (R35) never reach it. */
  archived?: ReadonlySet<string>;
}

export interface WaitStart {
  since: string | null;
  agent: string | null;
  message: string | null;
}

const isOpenTask = (t: Task) => t.status === "open" || t.status === "claimed";

/**
 * When the row started waiting: the newest stamped body entry written by someone other than the
 * operator, else the task's `updated`. The operator's own replies never count, which is what
 * makes a row leave the queue the moment it is answered.
 */
export function waitStart(task: Task, operator: string | null, body?: string | null): WaitStart {
  let latest: Comment | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const c of parseComments(splitBody(body).rest)) {
    if (!c.at || c.actor === operator) continue;
    const at = Date.parse(c.at);
    if (Number.isNaN(at) || at < latestAt) continue;
    latest = c;
    latestAt = at;
  }
  if (latest) return { since: latest.at, agent: latest.actor, message: latest.text || null };
  return { since: task.updated, agent: task.claimed_by ?? task.owner, message: null };
}

const sinceValue = (s: string | null): number => {
  if (!s) return Number.NaN;
  return Date.parse(s);
};

/** Oldest wait first; rows without a timestamp last, ties broken by id so the order is stable. */
function byWait(a: WaitingTask, b: WaitingTask): number {
  const x = sinceValue(a.since);
  const y = sinceValue(b.since);
  const xNaN = Number.isNaN(x);
  const yNaN = Number.isNaN(y);
  if (xNaN || yNaN) {
    if (xNaN && yNaN) return a.task.id.localeCompare(b.task.id);
    return xNaN ? 1 : -1;
  }
  return x - y || a.task.id.localeCompare(b.task.id);
}

/**
 * R39: every open task waiting for the operator, once each, longest wait first. A row is in the
 * queue when its session state asks for input (a `needs-input` or `agent-error` label) or when it
 * is blocked by an open task assigned to the operator. Tasks in archived projects never are.
 *
 * R16's rule, applied directly: unlike `sessionState`, a claimed task blocked by another agent
 * does not ask the operator for anything, so it is not listed.
 */
export function waitingOnMe(
  activeSet: readonly Task[],
  operator: string | null,
  opts: WaitingOptions = {},
): WaitingTask[] {
  const byId = new Map(activeSet.map((t) => [t.id, t] as const));
  const rows: WaitingTask[] = [];
  for (const task of activeSet) {
    if (!isOpenTask(task)) continue;
    if (task.project && opts.archived?.has(task.project)) continue;
    let kind: WaitKind;
    let blocker: Task | null = null;
    if (task.tags.some((x) => NEEDS_INPUT_LABELS.includes(x))) {
      kind = "needs-input";
    } else if (task.tags.some((x) => ERROR_LABELS.includes(x))) {
      kind = "error";
    } else {
      if (!operator) continue;
      blocker =
        task.blocked_by
          .map((id) => byId.get(id))
          .find((b) => !!b && isOpenTask(b) && (b.owner === operator || b.claimed_by === operator)) ?? null;
      if (!blocker) continue;
      kind = "blocked";
    }
    rows.push({ task, kind, blocker, ...waitStart(task, operator, opts.bodies?.get(task.id)) });
  }
  return rows.sort(byWait);
}
