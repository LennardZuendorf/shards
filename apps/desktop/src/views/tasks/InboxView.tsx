import { InboxIcon } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { DisplayMenu } from "@/components/task/DisplayMenu";
import { FilterChips } from "@/components/task/FilterChips";
import { FilterMenu } from "@/components/task/FilterMenu";
import { GettingStarted } from "@/components/task/GettingStarted";
import { useViewOptions } from "@/components/task/hooks";
import { isEmptyVault } from "@/components/task/onboarding";
import { SectionedList } from "@/components/task/SectionedList";
import { TaskComposer } from "@/components/task/TaskComposer";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { useHostStatus, useProjects, useTasks } from "@/lib/hooks";
import { countTopLevel } from "@/lib/scope";

/** Inbox: open tasks without a project (subtasks nest under their parents); onboarding when the vault is empty. */
export function InboxView() {
  const q = useTasks();
  const status = useHostStatus();
  const projects = useProjects();
  const empty = isEmptyVault(status.data?.counts.tasks, projects.data?.length);
  const vo = useViewOptions("inbox");
  const tasks = useMemo(() => (q.data ?? []).filter((t) => !t.project && (t.status === "open" || t.status === "claimed")), [q.data]);
  // Top-level only, the rule the sidebar badge uses (an orphaned subtask is a root and counts).
  const n = countTopLevel(tasks);
  return (
    <TaskView
      title="Inbox"
      toolbar={
        <>
          <FilterMenu filters={vo.options.filters} onChange={vo.setFilters} />
          <DisplayMenu options={vo.options} onChange={vo.set} defaultLabel="Sections" />
        </>
      }
      below={<FilterChips filters={vo.options.filters} onChange={vo.setFilters} />}
      subtitle={q.data ? <span>{n ? `${n} task${n > 1 ? "s" : ""}` : "Nothing waiting"}</span> : null}
    >
      {q.isLoading ? (
        <TaskListSkeleton />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : tasks.length === 0 && empty ? (
        <GettingStarted />
      ) : tasks.length === 0 ? (
        <>
          <TaskComposer defaults={{ project: null }} />
          <EmptyState
            icon={InboxIcon}
            tone="success"
            title="Inbox zero"
            description="Everything is filed. Capture anything with Q, or type above — try “Call Sam tomorrow 3pm p2”."
          />
        </>
      ) : (
        <SectionedList project={null} tasks={tasks} storageKey="inbox" options={vo.options} ctx={vo.ctx} onFilters={vo.setFilters} />
      )}
    </TaskView>
  );
}
