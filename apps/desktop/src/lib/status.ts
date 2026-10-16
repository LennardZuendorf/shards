/** D4 delegation model helpers: who is working on a task and in which session state. */
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
