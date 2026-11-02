import { EllipsisIcon, TagIcon, TagsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LabelDialogs, LabelMenuItems, type LabelDialog } from "@/components/task/LabelMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { DisplayMenu } from "@/components/task/DisplayMenu";
import { FilterChips } from "@/components/task/FilterChips";
import { FilterMenu } from "@/components/task/FilterMenu";
import { archivedProjectIds, labelGroups, labelViewTasks } from "@/components/task/group-specs";
import { useViewOptions } from "@/components/task/hooks";
import { TaskComposer } from "@/components/task/TaskComposer";
import { TaskList } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { useProjects, useTasks } from "@/lib/hooks";
import { navigate, paths, useRouteParams } from "@/lib/router";
import { applyViewOptions, isStaticGrouping } from "@/lib/view-options";

/** Every open task carrying one label, grouped by project (Inbox first), soonest due first. */
export function LabelView() {
  const { name = "" } = useRouteParams<{ name: string }>();
  const q = useTasks();
  const projects = useProjects();
  const [dialog, setDialog] = useState<LabelDialog>(null);
  const vo = useViewOptions(`label:${name}`);
  const toolbar = (
    <>
      <FilterMenu filters={vo.options.filters} onChange={vo.setFilters} />
      <DisplayMenu options={vo.options} onChange={vo.set} defaultLabel="Project" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Label actions" className="text-muted-foreground">
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <LabelMenuItems name={name} onDialog={setDialog} />
        </DropdownMenuContent>
      </DropdownMenu>
      <LabelDialogs dialog={dialog} onClose={() => setDialog(null)} onRenamed={(_from, to) => navigate(paths.label(to))} />
    </>
  );
  const tasks = useMemo(
    () => (q.data ?? []).filter((t) => (t.status === "open" || t.status === "claimed") && t.tags.includes(name)),
    [q.data, name],
  );
  const archived = useMemo(() => archivedProjectIds(projects.data), [projects.data]);
  // One list feeds the groups, the count and the empty branch, so an all-archived label reads as zero.
  const visible = useMemo(() => labelViewTasks(tasks, archived), [tasks, archived]);
  const delivered = useMemo(() => {
    const list = projects.data ?? [];
    const title = (id: string | null) => (id ? (list.find((p) => p.id === id)?.title ?? id) : "Inbox");
    return labelGroups(
      visible,
      list.map((p) => p.id),
      title,
      name,
      archived,
    );
  }, [visible, projects.data, name, archived]);
  const groups = applyViewOptions(delivered, vo.options, vo.ctx);
  const icon = (
    <TagIcon className="size-5 text-muted-foreground" />
  );
  return (
    <TaskView
      title={name}
      icon={icon}
      toolbar={toolbar}
      below={<FilterChips filters={vo.options.filters} onChange={vo.setFilters} />}
      subtitle={q.data ? <span>{visible.length ? `${visible.length} open task${visible.length > 1 ? "s" : ""}` : "No open tasks"}</span> : null}
    >
      {q.isLoading ? (
        <TaskListSkeleton />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : visible.length === 0 ? (
        <>
          <TaskComposer defaults={{ labels: [name] }} />
          <EmptyState
            icon={TagsIcon}
            tone="muted"
            title={`Nothing labelled @${name}`}
            description="Tasks you add here get this label. In quick add, type @ to label anything."
          />
        </>
      ) : (
        <TaskList
          storageKey={`label.${name}`}
          groups={groups}
          rowProps={{ showProject: vo.options.group !== "default" && vo.options.group !== "project", density: vo.options.density }}
          sorted={vo.options.sort !== "manual"}
          static={isStaticGrouping(vo.options)}
          filters={{ value: vo.options.filters, onChange: vo.setFilters }}
        />
      )}
    </TaskView>
  );
}
