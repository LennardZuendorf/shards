/**
 * Shared data hooks over the API + query keys. Views should prefer these so caches are shared
 * (and invalidated by vault events) across the sidebar, palette and views.
 */
import { withProjectColors } from "./color";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  hostProjectUpdateSupported,
  hostNoteRead,
  hostNotesBrowse,
  hostStatus,
  membersSafe,
  noteList,
  projectsSafe,
  taskGet,
  taskList,
  type NoteListArgs,
  type TaskListArgs,
} from "./api";
import { isOverdue, dueBucket } from "./dates";
import { useNow } from "./now";
import { qk } from "./query";
import { countTopLevel, isMine, projectCounts, useTaskScope } from "./scope";
import type { HostStatus, Member, Project, Task } from "./types";

/** Open + claimed tasks: the working set most views filter client-side. */
export const OPEN_ARGS: TaskListArgs = { status: "open,claimed" };

export function useTasks(args: TaskListArgs = OPEN_ARGS, opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.tasks.list(args), queryFn: () => taskList(args), enabled: opts.enabled });
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.tasks.detail(id ?? ""),
    queryFn: () => taskGet(id ?? ""),
    enabled: !!id,
  });
}

export function useNotes(args: NoteListArgs = {}) {
  return useQuery({ queryKey: qk.notes.list(args), queryFn: () => noteList(args) });
}

/** Every Markdown file in the notes space (read-only browser). */
export function useNoteFiles() {
  return useQuery({ queryKey: qk.notes.files, queryFn: hostNotesBrowse, staleTime: 30_000 });
}

/** One browsed file with its body. */
export function useNoteFile(path: string | null | undefined) {
  return useQuery({ queryKey: qk.notes.file(path ?? ""), queryFn: () => hostNoteRead(path ?? ""), enabled: !!path });
}

/** `host_status`, or `null` when the host does not implement it yet. */
export function useHostStatus() {
  return useQuery<HostStatus | null>({
    queryKey: qk.host.status,
    queryFn: () => hostStatus().catch(() => null),
    staleTime: 60_000,
  });
}

/** The acting human identity (`[core].me`), when known. */
export function useMe(): string | null {
  return useHostStatus().data?.me ?? null;
}

export function useProjects() {
  const open = useTasks();
  return useQuery<Project[]>({
    queryKey: qk.host.projects,
    // A project id kept only by done tasks (its note deleted) comes back titled with its raw id
    // and no open tasks: hide it rather than resurrect a deleted project.
    queryFn: async () => withProjectColors((await projectsSafe(open.data)).filter((p) => !(p.title === p.id && p.open_count === 0))),
    enabled: !open.isLoading,
  });
}

/** Can project title, color and sections be written (`host_project_update`)? `false` until known. */
export function useProjectMetaSupported(): boolean {
  return (
    useQuery({
      queryKey: [...qk.host.caps, "project_update"],
      queryFn: hostProjectUpdateSupported,
      staleTime: 5 * 60_000,
    }).data ?? false
  );
}

export function useMembers() {
  const me = useMe();
  const open = useTasks();
  return useQuery<Member[]>({
    queryKey: qk.host.members,
    queryFn: () => membersSafe(me, open.data),
    enabled: !open.isLoading,
  });
}

/** Lookup helper: id → member (falls back to a synthesized human/agent entry). */
export function useMemberMap() {
  const { data } = useMembers();
  return useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data]);
}

export interface LabelInfo {
  name: string;
  count: number;
}

/** Labels = distinct tags across open tasks, most used first. */
export function useLabels(): LabelInfo[] {
  const { data } = useTasks();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of data ?? []) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"));
  }, [data]);
}

/** Today = due today or overdue. */
export const isTodayTask = (t: Task, now = new Date()) => {
  if (!t.due) return false;
  return isOverdue(t.due, now) || dueBucket(t.due, now) === "today" || dueBucket(t.due, now) === "overdue";
};

/**
 * Sidebar counts derived from the open working set, by the same rules the views render:
 * top-level tasks only (an orphaned subtask is a root, so it counts), and Today follows the
 * view's Mine/Everyone scope.
 */
export function useTaskCounts() {
  const { data } = useTasks();
  const now = useNow();
  const me = useMe();
  const [scope] = useTaskScope("today");
  return useMemo(() => {
    const inbox: Task[] = [];
    const today: Task[] = [];
    let overdue = 0;
    for (const t of data ?? []) {
      if (!t.project) inbox.push(t);
      if (isTodayTask(t, now) && (scope === "everyone" || isMine(t, me))) {
        today.push(t);
        if (dueBucket(t.due, now) === "overdue") overdue++;
      }
    }
    return { inbox: countTopLevel(inbox), today: today.length, overdue, open: data?.length ?? 0 };
  }, [data, now, me, scope]);
}

/** Open top-level task count per project: one number for the sidebar, palette and headers. */
export function useProjectCounts(): Map<string, number> | null {
  const { data } = useTasks();
  return useMemo(() => (data ? projectCounts(data) : null), [data]);
}
