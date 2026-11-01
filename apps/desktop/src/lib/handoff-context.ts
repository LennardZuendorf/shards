import type { Task } from "./types";

/** UI availability only. Mutations and claim-conflict checks stay in existing task actions/core. */
export function handoffContext(task: Task | null, me: string | null) {
  const active = !!task && !!me && (task.status === "open" || task.status === "claimed");
  const canRelease = active && task.status === "claimed" && !!task.claimed_by;
  return {
    canAssign: active && task.status === "open" && !task.claimed_by,
    canTakeBack: canRelease && task.owner === me && task.claimed_by !== me,
    canRelease,
  };
}
