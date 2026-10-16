import { CheckCircle2Icon, Columns3Icon, EllipsisIcon, FolderOpenIcon, HashIcon, KanbanIcon, ListIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePersistentState } from "@/components/task/hooks";
import { SectionedList } from "@/components/task/SectionedList";
import { useSectionStore } from "@/components/task/section-store";
import { ProjectDialogs, ProjectMenuItems } from "@/components/task/ProjectMenu";
import { useArchiveProject, type ProjectDialog } from "@/components/task/project-actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TaskBoard } from "@/components/task/TaskBoard";
import { TaskComposer } from "@/components/task/TaskComposer";
import { countTopLevel } from "@/components/task/model";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { useHeaderTitle } from "@/app/header";
import { entityColor } from "@/lib/color";
import { useProjects, useTasks } from "@/lib/hooks";
import { useRouteParams } from "@/lib/router";
import { cn } from "@/lib/utils";

type Layout = "list" | "board-section" | "board-status";

export function ProjectView() {
  const { id = "" } = useRouteParams<{ id: string }>();
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === id) ?? null;
  const q = useTasks();
  const [layout, setLayout] = usePersistentState<Layout>(`shards.project.${id}.layout`, "list");
  const [showDone, setShowDone] = usePersistentState<boolean>(`shards.project.${id}.done`, false);
  const [dialog, setDialog] = useState<ProjectDialog>(null);
  const archive = useArchiveProject();
  const doneArgs = useMemo(() => ({ status: "done,cancelled", project: id, since: "30d" }), [id]);
  const done = useTasks(doneArgs, { enabled: showDone || layout === "board-status" });
  useHeaderTitle(project?.title ?? null);

  const tasks = useMemo(
    () => (q.data ?? []).filter((t) => t.project === id && (t.status === "open" || t.status === "claimed")),
    [q.data, id],
  );
  const completed = useMemo(() => (done.data ?? []).filter((t) => t.project === id), [done.data, id]);
  const store = useSectionStore(id, tasks);
  const sections = store.sections;
  const title = project?.title ?? (projects.isLoading ? "" : id);
  const board = layout !== "list";

  const toolbar = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showDone}
            aria-label="Show completed tasks"
            onClick={() => setShowDone((v) => !v)}
            className={cn("text-muted-foreground", showDone && "bg-accent text-foreground")}
          >
            <CheckCircle2Icon /> <span className="hidden @2xl/view:inline">Completed</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{showDone ? "Hide" : "Show"} completed tasks (30 days)</TooltipContent>
      </Tooltip>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={layout}
        onValueChange={(v) => v && setLayout(v as Layout)}
        aria-label="Layout"
      >
        <ToggleGroupItem value="list" aria-label="List" title="List" className="gap-1.5 px-2.5 text-xs">
          <ListIcon /> <span className="hidden @2xl/view:inline">List</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="board-section" aria-label="Board by section" title="Board by section" className="gap-1.5 px-2.5 text-xs">
          <Columns3Icon /> <span className="hidden @2xl/view:inline">Board</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="board-status" aria-label="Board by status" title="Board by status" className="gap-1.5 px-2.5 text-xs">
          <KanbanIcon /> <span className="hidden @2xl/view:inline">Status</span>
        </ToggleGroupItem>
      </ToggleGroup>
      {project && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Project actions" className="text-muted-foreground">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <ProjectMenuItems project={project} kind="dropdown" onDialog={setDialog} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );

  const known = !!project || tasks.length > 0 || completed.length > 0;
  const topCount = countTopLevel(tasks);

  return (
    <TaskView
      wide={board}
      title={title}
      icon={<HashIcon className="size-5" style={{ color: entityColor(id, project?.color) }} />}
      subtitle={
        q.data ? (
          <span>
            {project?.archived && (
              <button
                type="button"
                onClick={() => archive(project, false)}
                title="Unarchive"
                className="mr-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Archived · Unarchive
              </button>
            )}
            {topCount ? `${topCount} open task${topCount > 1 ? "s" : ""}` : "No open tasks"}
          </span>
        ) : null
      }
      toolbar={toolbar}
    >
      {q.isLoading ? (
        <TaskListSkeleton groups={2} rows={3} />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : !known && !projects.isLoading ? (
        <EmptyState
          icon={FolderOpenIcon}
          tone="muted"
          title="No such project"
          description={
            <>
              Nothing in this vault points at <code className="font-mono text-xs">{id}</code> yet. Add a task to start it.
            </>
          }
          action={<TaskComposer defaults={{ project: id }} className="w-80" />}
        />
      ) : board ? (
        <TaskBoard
          project={id}
          mode={layout === "board-status" ? "status" : "section"}
          tasks={tasks}
          completed={showDone || layout === "board-status" ? completed : []}
          sections={sections}
          onAddSection={(name) => !sections.includes(name) && store.setOrder([...sections, name])}
          onBeforeDrop={store.ensurePersisted}
        />
      ) : tasks.length === 0 && !showDone ? (
        <>
          <SectionedList project={id} tasks={tasks} storageKey={`project.${id}`} />
          <EmptyState
            compact
            icon={CheckCircle2Icon}
            tone="success"
            title="All clear in this project"
            description="Add a task above, or press Q anywhere."
            className="-mt-4"
          />
        </>
      ) : (
        <SectionedList
          project={id}
          tasks={tasks}
          completed={showDone ? completed : null}
          storageKey={`project.${id}`}
        />
      )}
    </TaskView>
  );
}
