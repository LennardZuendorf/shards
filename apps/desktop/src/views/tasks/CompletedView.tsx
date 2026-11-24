/**
 * Completed (R34): every task finished in the last 30 days, across all projects (archived ones
 * included), newest first, in local-day groups. Each row shows the title, its project, the
 * completion time and the identity that last wrote the file (`updated_by`; "unknown" while the
 * vault carries no actor stamp).
 *
 * Reopen is the row's checkbox: it sets the task open again (`status: open`, which clears
 * `completed`) and the row leaves the log. A recurring task appears once, at its latest
 * completion — its file keeps one `completed` — and its row shows the recurrence and next date
 * with no toggle, because that task is still open.
 *
 * The view only reads: the two listings are plain `shards_task_list` queries.
 */
import { CheckCircle2Icon, Repeat2Icon } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { completedDayGroups, completedLog } from "@/components/task/model";
import { TaskList, type TaskGroupSpec } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { toDateKey } from "@/lib/dates";
import { useTasks } from "@/lib/hooks";
import type { TaskListArgs } from "@/lib/api";

/**
 * `since` filters `updated`, so it is asked for one day more than the log shows; the 30-day rule
 * itself is the client's, applied to `completed` at the local day boundary (tech.md § Completed
 * log). A finish stamps `updated` and `completed` together, so the wider ask never adds a row
 * that the client keeps by mistake.
 */
const DONE_ARGS: TaskListArgs = { status: "done", since: "31d" };

export function CompletedView() {
  const done = useTasks(DONE_ARGS);
  const active = useTasks();
  const now = new Date();
  // Recompute when the local day rolls over, so "Today" and the window stay true while open.
  const todayKey = toDateKey(now);
  const entries = useMemo(
    () => completedLog(done.data ?? [], active.data ?? [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done.data, active.data, todayKey],
  );
  const groups: TaskGroupSpec[] = useMemo(
    () =>
      completedDayGroups(entries, now).map((g) => ({
        key: `day:${g.day}`,
        title: g.label,
        label: g.label,
        tasks: g.tasks,
        collapsible: false,
        // Already newest-first: keep the order `completedLog` established.
        compare: () => 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, todayKey],
  );
  const loading = done.isLoading || active.isLoading;
  const error = done.error && !done.data ? done.error : null;

  return (
    <TaskView
      title="Completed"
      subtitle={
        done.data ? (
          <span>
            {entries.length ? `${entries.length} task${entries.length > 1 ? "s" : ""}` : "Nothing finished"} · last 30 days
          </span>
        ) : null
      }
    >
      {loading ? (
        <TaskListSkeleton groups={2} rows={4} />
      ) : error ? (
        <TaskQueryError error={error} onRetry={() => void done.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={CheckCircle2Icon}
          tone="muted"
          title="Nothing completed in the last 30 days"
          description="Finished tasks appear here for 30 days, across every project — including archived ones."
        />
      ) : (
        <>
          <p className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Repeat2Icon className="mt-px size-3.5 shrink-0" />
            <span>
              A repeating task appears once, at its latest completion — its file keeps one completion time. Reopen
              puts a finished task back in its lists.
            </span>
          </p>
          <TaskList static storageKey="completed" groups={groups} rowProps={{ showProject: true, showCompleted: true }} />
        </>
      )}
    </TaskView>
  );
}
