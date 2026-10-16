/** Data for the delegation board: tasks, readiness, activity, memory + scratch footprints. */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAllMemories } from "@/components/memory/hooks";
import { useScratchList } from "@/components/scratch/hooks";
import { recentActivity } from "@/lib/api";
import { useMe, useMembers, useTasks } from "@/lib/hooks";
import { qk } from "@/lib/query";
import { buildBoard } from "./agent-utils";

export const DONE_ARGS = { status: "done", since: "2d" } as const;
export const READY_ARGS = { status: "open", ready: true } as const;
const ACTIVITY_ARGS = { limit: 300, since: "7d" };

export function useActivity() {
  return useQuery({ queryKey: qk.activity(ACTIVITY_ARGS), queryFn: () => recentActivity(ACTIVITY_ARGS), staleTime: 15_000 });
}

export function useBoard(now: Date) {
  const me = useMe();
  const members = useMembers();
  const open = useTasks();
  const done = useTasks({ ...DONE_ARGS });
  const ready = useTasks({ ...READY_ARGS });
  const activity = useActivity();
  const memories = useAllMemories();
  const scratch = useScratchList();

  const board = useMemo(
    () =>
      buildBoard({
        members: members.data ?? [],
        me,
        open: open.data ?? [],
        done: done.data ?? [],
        readyIds: ready.data ? new Set(ready.data.map((t) => t.id)) : undefined,
        activity: activity.data ?? [],
        // Memory/scratch failures (space disabled) must not break the board.
        memories: memories.data ?? [],
        scratch: scratch.data ?? [],
        now,
      }),
    [members.data, me, open.data, done.data, ready.data, activity.data, memories.data, scratch.data, now],
  );

  return {
    board,
    me,
    loading: open.isLoading || members.isLoading,
    error: open.error,
  };
}
