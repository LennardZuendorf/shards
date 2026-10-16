import { EllipsisIcon, TagIcon, TagsIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LabelDialogs, LabelMenuItems, type LabelDialog } from "@/components/task/LabelMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { compareByDue } from "@/components/task/model";
import { TaskComposer } from "@/components/task/TaskComposer";
import { TaskList } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { hueFromString } from "@/lib/color";
import { useTasks } from "@/lib/hooks";
import { navigate, paths, useRouteParams } from "@/lib/router";

/** Every open task carrying one label, soonest due first. */
export function LabelView() {
  const { name = "" } = useRouteParams<{ name: string }>();
  const q = useTasks();
  const [dialog, setDialog] = useState<LabelDialog>(null);
  const toolbar = (
    <>
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
  const icon = (
    <TagIcon
      className="size-5 text-[oklch(0.62_0.13_var(--lb-h))]"
      style={{ "--lb-h": String(hueFromString(name)) } as CSSProperties}
    />
  );
  return (
    <TaskView
      title={name}
      icon={icon}
      toolbar={toolbar}
      subtitle={q.data ? <span>{tasks.length ? `${tasks.length} open task${tasks.length > 1 ? "s" : ""}` : "No open tasks"}</span> : null}
    >
      {q.isLoading ? (
        <TaskListSkeleton />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : tasks.length === 0 ? (
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
          groups={[{ key: "all", tasks, compare: compareByDue, addDefaults: { labels: [name] }, collapsible: false }]}
          rowProps={{ showProject: true }}
          static
        />
      )}
    </TaskView>
  );
}
