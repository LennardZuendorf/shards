/**
 * Task detail pane (registered for `?open=task:<id>`): editable title, Markdown description,
 * a fields grid, subtasks, blockers, activity with comments, and a metadata footer.
 */
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisIcon,
  FileIcon,
  FlagIcon,
  GitForkIcon,
  HandIcon,
  HashIcon,
  InboxIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  SendHorizontalIcon,
  TagIcon,
  TargetIcon,
  UndoDotIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Avatar, MemberAvatar } from "@/components/shared/Avatar";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { LabelChip } from "@/components/shared/LabelChip";
import { PriorityCheckbox } from "@/components/shared/PriorityCheckbox";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openTask, type DetailRendererProps } from "@/app/detail";
import { hostTaskSetBody, taskAppend } from "@/lib/api";
import { guessMemberKind } from "@/lib/api/host";
import { entityColor } from "@/lib/color";
import { parseDue, relativeTime, toDateKey } from "@/lib/dates";
import { useMemberMap, useTask, useTasks } from "@/lib/hooks";
import { PRIORITY_META, asPriority } from "@/lib/priority";
import { qk } from "@/lib/query";
import { describeRecur } from "@/lib/recur";
import { navigate, paths } from "@/lib/router";
import { sessionState, statusLabel } from "@/lib/status";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OpenInButton } from "@/components/shared/OpenIn";
import { useOpenHotkey } from "@/components/shared/open-in";
import { useTaskActions, type TaskActions } from "./actions";
import { useOpenIds, useOpenTaskMap, useProjectMap } from "./hooks";
import { Markdown } from "./Markdown";
import { buildTree, compareManual, joinBody, openBlockers, parseComments, splitBody, type Comment } from "./model";
import { errorText, isUnknownTool } from "./patch";
import {
  LabelPickerContent,
  MemberPickerContent,
  PriorityItems,
  ProjectPickerContent,
  RecurList,
  ScheduleContent,
  TaskPickerContent,
} from "./pickers";
import { completeAnimated } from "./selection";
import { TaskComposer } from "./TaskComposer";
import { TaskMenuItems } from "./TaskMenu";
import { TaskRow } from "./TaskRow";
import { useNow } from "@/lib/now";

/** Set once the host answered "unknown tool" for host_task_set_body. */
let bodyEditUnsupported = false;

export function TaskDetail({ id, onClose }: DetailRendererProps) {
  const q = useTask(id);
  const t = q.data;
  if (q.isLoading) {
    return (
      <Shell onClose={onClose}>
        <div className="space-y-4 p-6">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }
  if (!t) {
    return (
      <Shell onClose={onClose}>
        <EmptyState
          compact
          icon={FileIcon}
          tone="muted"
          title="Task not found"
          description={q.error ? errorText(q.error) : `${id} may have been deleted or moved out of the vault.`}
          action={
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          }
        />
      </Shell>
    );
  }
  return <Loaded task={t} onClose={onClose} />;
}

function Shell({ children, onClose, header, actions }: { children: ReactNode; onClose: () => void; header?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-task-detail className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <div className="min-w-0 flex-1">{header}</div>
        {actions}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details" className="text-muted-foreground">
              <XIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Close <Kbd keys="escape" inverted className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Loaded({ task, onClose }: { task: Task; onClose: () => void }) {
  const actions = useTaskActions();
  const projects = useProjectMap();
  const project = task.project ? projects.get(task.project) : null;
  const done = task.status === "done" || task.status === "cancelled";
  useOpenHotkey(task.path);

  const header = (
    <div className="flex min-w-0 items-center gap-1 text-small">
      <button
        type="button"
        onClick={() => navigate(task.project ? paths.project(task.project) : paths.inbox())}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {task.project ? (
          <HashIcon className="size-3.5 shrink-0" style={{ color: entityColor(task.project, project?.color) }} />
        ) : (
          <InboxIcon className="size-3.5 shrink-0 text-foreground" />
        )}
        <span className="truncate">{task.project ? (project?.title ?? task.project) : "Inbox"}</span>
        {task.section && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate">{task.section}</span>
          </>
        )}
      </button>
      <div className="ml-auto flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions" className="text-muted-foreground">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <TaskMenuItems task={task} actions={actions} kind="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <Shell onClose={onClose} header={header} actions={task.path ? <OpenInButton absPath={task.path} compact className="mr-1" /> : null}>
      <div className="px-5 pt-5 pb-3">
        {task.parent && <ParentCrumb id={task.parent} />}
        <div className="flex items-start gap-3">
          <PriorityCheckbox
            priority={task.priority}
            checked={done}
            recurring={!!task.recur}
            className="mt-[5px]"
            onCheckedChange={() => (done ? actions.reopen(task) : completeAnimated(task, actions.complete))}
          />
          <TitleEditor task={task} actions={actions} />
        </div>
        <StatusLine task={task} actions={actions} />
        <Description task={task} />
      </div>
      <Fields task={task} actions={actions} />
      <Subtasks task={task} />
      <Dependencies task={task} actions={actions} />
      <Activity task={task} />
      <Footer task={task} />
    </Shell>
  );
}

function ParentCrumb({ id }: { id: string }) {
  const open = useOpenTaskMap();
  const p = open.get(id);
  return (
    <button
      type="button"
      onClick={() => openTask(id)}
      className="mb-2 ml-[30px] inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <GitForkIcon className="size-3 rotate-180" />
      <span className="truncate">{p?.title ?? id}</span>
      <ChevronRightIcon className="size-3" />
    </button>
  );
}

/* ------------------------------------------------------------- title */

function TitleEditor({ task, actions }: { task: Task; actions: TaskActions }) {
  const [value, setValue] = useState(task.title);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  if (!focused && value !== task.title) setValue(task.title);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const save = () => actions.rename(task, value);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label="Task title"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        save();
      }}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setValue(task.title);
          setFocused(false);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
      className={cn(
        "-mx-1.5 min-w-0 flex-1 resize-none overflow-hidden rounded-md bg-transparent px-1.5 py-0.5 text-title leading-7 font-semibold tracking-tight outline-none hover:bg-accent/50 focus:bg-transparent focus:ring-2 focus:ring-ring",
        (task.status === "done" || task.status === "cancelled") && "text-muted-foreground line-through decoration-muted-foreground/50",
      )}
    />
  );
}

function StatusLine({ task, actions }: { task: Task; actions: TaskActions }) {
  const members = useMemberMap();
  if (task.status === "open" && !task.claimed_by) return null;
  const kind = task.claimed_by ? (members.get(task.claimed_by)?.kind ?? guessMemberKind(task.claimed_by, actions.me)) : null;
  return (
    <div className="mt-2 ml-[30px] flex flex-wrap items-center gap-2 text-xs">
      {task.status === "done" || task.status === "cancelled" ? (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <CheckCircle2Icon className="size-3.5" />
            {task.status === "done" ? "Completed" : "Cancelled"}
            {task.completed && <span className="font-normal text-muted-foreground">· {relativeTime(task.completed)}</span>}
          </span>
          <Button variant="outline" size="xs" onClick={() => actions.reopen(task)}>
            <UndoDotIcon /> Reopen
          </Button>
        </>
      ) : task.claimed_by ? (
        <>
          {kind === "agent" ? (
            <StatusBadge state={sessionState(task)} label={`${statusLabel(task, members).replace("In progress", sessionState(task) === "working" ? "Working" : "In progress")}`} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
              <HandIcon className="size-3" /> {statusLabel(task, members)}
            </span>
          )}
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => actions.release(task)}>
            Release
          </Button>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- description */

function Description({ task }: { task: Task }) {
  const client = useQueryClient();
  const { description, rest } = useMemo(() => splitBody(task.body), [task.body]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [saving, setSaving] = useState(false);
  const [unsupported, setUnsupported] = useState(bodyEditUnsupported);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [draft, editing]);

  const start = () => {
    if (unsupported) return;
    setDraft(description);
    setEditing(true);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(ref.current.value.length, ref.current.value.length);
    });
  };

  const save = async () => {
    if (draft.trimEnd() === description) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await hostTaskSetBody(task.id, joinBody(draft, rest));
      setEditing(false);
      void client.invalidateQueries({ queryKey: qk.tasks.detail(task.id) });
    } catch (e) {
      if (isUnknownTool(e)) {
        bodyEditUnsupported = true;
        setUnsupported(true);
        toast.error("Editing descriptions needs a newer Shards host", { description: "host_task_set_body is not available. Your text is kept in the editor." });
      } else toast.error(`Couldn’t save description: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-3 ml-[30px]">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          placeholder="Description (Markdown)"
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 font-mono text-micro leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-micro text-muted-foreground">Markdown · <Kbd keys="mod+enter" /> to save</span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="xs" onClick={() => void save()} disabled={saving || unsupported}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {unsupported && <p className="mt-1.5 text-micro text-warning">This Shards host can’t edit task bodies yet (needs host_task_set_body).</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 ml-[30px]">
      {description ? (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, input")) return;
            start();
          }}
          onKeyDown={(e) => e.key === "Enter" && start()}
          title={unsupported ? "Read-only: this host can’t edit task bodies yet" : "Click to edit"}
          className={cn("-mx-2 rounded-md px-2 py-1 transition-colors", !unsupported && "cursor-text hover:bg-accent/40")}
        >
          <Markdown>{description}</Markdown>
        </div>
      ) : unsupported ? null : (
        <button type="button" onClick={start} className="-mx-2 inline-flex items-center gap-2 rounded-md px-2 py-1 text-small text-muted-foreground hover:bg-accent/40 hover:text-foreground">
          <PencilIcon className="size-3.5" /> Add description
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ fields */

function FieldRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

const fieldBtn =
  "inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-small text-foreground/90 transition-colors hover:bg-accent data-[state=open]:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const placeholder = "text-muted-foreground";

function Fields({ task, actions }: { task: Task; actions: TaskActions }) {
  const now = useNow();
  const projects = useProjectMap();
  const project = task.project ? projects.get(task.project) : null;
  const [open, setOpen] = useState<string | null>(null);
  const pop = (key: string) => ({ open: open === key, onOpenChange: (o: boolean) => setOpen(o ? key : null) });
  const close = () => setOpen(null);
  const pm = PRIORITY_META[asPriority(task.priority)];
  const deadline = parseDue(task.deadline);

  return (
    <div className="mx-3 space-y-0.5 rounded-xl border bg-muted/20 px-2 py-2">
      <FieldRow icon={HashIcon} label="Project">
        <Popover {...pop("project")}>
          <PopoverTrigger className={fieldBtn}>
            {task.project ? (
              <HashIcon className="size-3.5 shrink-0" style={{ color: entityColor(task.project, project?.color) }} />
            ) : (
              <InboxIcon className="size-3.5 shrink-0 text-foreground" />
            )}
            <span className="truncate">{task.project ? (project?.title ?? task.project) : "Inbox"}</span>
            {task.section && <span className="truncate text-muted-foreground">/ {task.section}</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <ProjectPickerContent
              project={task.project}
              section={task.section}
              onPick={(p, s, label) => {
                actions.moveTo(task, p, s, label);
                close();
              }}
            />
          </PopoverContent>
        </Popover>
      </FieldRow>

      <FieldRow icon={CalendarIcon} label="Due">
        <Popover {...pop("due")}>
          <PopoverTrigger className={fieldBtn}>
            {task.due ? <DueChip due={task.due} recur={task.recur} recurFrom={task.recur_from} className="text-small" /> : <span className={placeholder}>No date</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <ScheduleContent
              due={task.due}
              onPick={(d) => actions.schedule(task, d)}
              recur={task.recur}
              recurFrom={task.recur_from}
              onRecur={(r, f) => actions.setRecur(task, r, f)}
              onDone={close}
            />
          </PopoverContent>
        </Popover>
        {task.due && <ClearBtn label="Remove due date" onClick={() => actions.schedule(task, null)} />}
      </FieldRow>

      <FieldRow icon={RepeatIcon} label="Repeat">
        <Popover {...pop("recur")}>
          <PopoverTrigger className={fieldBtn}>
            {task.recur ? <span className="truncate text-due-today">{describeRecur(task.recur, task.recur_from)}</span> : <span className={placeholder}>Doesn’t repeat</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1.5">
            <RecurList
              recur={task.recur ?? null}
              recurFrom={task.recur_from ?? null}
              onPick={(r, f) => {
                actions.setRecur(task, r, f);
                if (r && !task.due) actions.schedule(task, toDateKey(new Date()));
                close();
              }}
            />
          </PopoverContent>
        </Popover>
      </FieldRow>

      <FieldRow icon={TargetIcon} label="Deadline">
        <Popover {...pop("deadline")}>
          <PopoverTrigger className={fieldBtn}>
            {task.deadline ? (
              <>
                <DeadlineChip deadline={task.deadline} className="text-small" />
                <span className="text-xs text-muted-foreground">{deadline && format(deadline.date, "EEE d MMM")}</span>
              </>
            ) : (
              <span className={placeholder}>No deadline</span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={deadline?.date}
              defaultMonth={deadline?.date ?? now}
              weekStartsOn={1}
              onSelect={(d) => {
                if (d) actions.setDeadline(task, toDateKey(d));
                close();
              }}
            />
          </PopoverContent>
        </Popover>
        {task.deadline && <ClearBtn label="Remove deadline" onClick={() => actions.setDeadline(task, null)} />}
      </FieldRow>

      <FieldRow icon={FlagIcon} label="Priority">
        <DropdownMenu>
          <DropdownMenuTrigger className={fieldBtn}>
            <PriorityFlag priority={task.priority ?? "normal"} hideLow={false} />
            <span>{pm.label}</span>
            <span className="text-xs text-muted-foreground">{pm.short}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <PriorityItems value={task.priority} onPick={(p) => actions.setPriority(task, p)} />
          </DropdownMenuContent>
        </DropdownMenu>
      </FieldRow>

      <FieldRow icon={TagIcon} label="Labels">
        {task.tags.map((l) => (
          <LabelChip key={l} name={l} size="md" onRemove={() => actions.setLabels(task, task.tags.filter((x) => x !== l))} />
        ))}
        <Popover {...pop("labels")}>
          <PopoverTrigger className={cn(fieldBtn, task.tags.length && "size-7 justify-center px-0")} aria-label="Edit labels">
            {task.tags.length ? <PlusIcon className="size-3.5 text-muted-foreground" /> : <span className={placeholder}>Add labels</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <LabelPickerContent value={task.tags} onChange={(labels) => actions.setLabels(task, labels)} />
          </PopoverContent>
        </Popover>
      </FieldRow>

      <FieldRow icon={UserRoundIcon} label="Assignee">
        <Popover {...pop("owner")}>
          <PopoverTrigger className={fieldBtn}>
            {task.owner ? (
              <>
                <MemberAvatar id={task.owner} size="sm" />
                <MemberName id={task.owner} />
              </>
            ) : (
              <span className={placeholder}>Unassigned</span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <MemberPickerContent
              value={task.owner}
              onPick={(idv) => {
                actions.setOwner(task, idv);
                close();
              }}
            />
          </PopoverContent>
        </Popover>
      </FieldRow>

      <FieldRow icon={HandIcon} label="Working">
        {task.claimed_by ? (
          <>
            <span className={cn(fieldBtn, "hover:bg-transparent")}>
              <MemberAvatar id={task.claimed_by} size="sm" active={sessionState(task) === "working"} />
              <MemberName id={task.claimed_by} />
            </span>
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => actions.release(task)}>
              Release
            </Button>
          </>
        ) : task.status === "open" ? (
          <Button variant="ghost" size="xs" className="h-7 px-2 text-small font-normal text-muted-foreground" onClick={() => actions.claim(task)}>
            Claim as me
          </Button>
        ) : (
          <span className={cn(placeholder, "px-2 text-small")}>—</span>
        )}
      </FieldRow>
    </div>
  );
}

function MemberName({ id }: { id: string }) {
  const m = useMemberMap().get(id);
  return (
    <span className="truncate">
      {m?.name ?? id}
      {m?.kind === "agent" && <span className="ml-1 text-xs text-muted-foreground">agent</span>}
    </span>
  );
}

function ClearBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground">
      <XIcon className="size-3" />
    </button>
  );
}

/* ---------------------------------------------------------- subtasks */

function Section({ title, count, right, children }: { title: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t px-5 py-4 first-of-type:border-t-0">
      <header className="mb-2 flex items-center gap-2">
        <h3 className="text-small font-semibold">{title}</h3>
        {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        <div className="ml-auto flex items-center gap-1">{right}</div>
      </header>
      {children}
    </section>
  );
}

function Subtasks({ task }: { task: Task }) {
  const args = useMemo(() => ({ parent: task.id, status: "open,claimed,done,cancelled" }), [task.id]);
  const q = useTasks(args);
  const rows = useMemo(() => buildTree(q.data ?? [], compareManual).map((n) => n.task), [q.data]);
  const done = rows.filter((t) => t.status === "done" || t.status === "cancelled").length;
  const [showDone, setShowDone] = useState(false);
  const visible = rows.filter((t) => showDone || (t.status !== "done" && t.status !== "cancelled"));
  const lastOrder = rows.reduce<number | null>((m, t) => (typeof t.order === "number" && (m === null || t.order > m) ? t.order : m), null);
  return (
    <Section
      title="Subtasks"
      count={rows.length ? `${done}/${rows.length}` : undefined}
      right={
        done > 0 ? (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide completed" : `Show completed (${done})`}
          </Button>
        ) : null
      }
    >
      {rows.length > 0 && (
        <div className="mb-1 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(done / rows.length) * 100}%` }} />
        </div>
      )}
      <div role="list" className="-mx-1">
        {visible.map((t) => (
          <TaskRow key={t.id} task={t} showProject={false} />
        ))}
      </div>
      <TaskComposer
        compact
        label="Add subtask"
        defaults={{
          parent: task.id,
          project: task.project,
          section: task.section,
          order: (lastOrder ?? 0) + 1024,
        }}
      />
    </Section>
  );
}

/* ------------------------------------------------------ dependencies */

function Dependencies({ task, actions }: { task: Task; actions: TaskActions }) {
  const openMap = useOpenTaskMap();
  const openIds = useOpenIds();
  const [adding, setAdding] = useState(false);
  const unsatisfied = openBlockers(task, openIds);
  if (!task.blocked_by.length && !task.blocks.length && !adding) {
    return (
      <Section
        title="Dependencies"
        right={<AddBlocker task={task} actions={actions} open={adding} setOpen={setAdding} />}
      >
        <p className="text-xs text-muted-foreground">Not blocked by anything.</p>
      </Section>
    );
  }
  const row = (id: string, removable: boolean) => {
    const t = openMap.get(id);
    const isOpen = openIds.has(id);
    return (
      <div key={id} className="group/dep flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-accent/50">
        {isOpen ? <LockIcon className="size-3.5 shrink-0 text-warning" /> : <CheckCircle2Icon className="size-3.5 shrink-0 text-success" />}
        <button type="button" onClick={() => openTask(id)} className={cn("min-w-0 flex-1 truncate text-left text-small hover:underline", !isOpen && "text-muted-foreground line-through")}>
          {t?.title ?? id}
        </button>
        <span className="font-mono text-micro text-muted-foreground">{id}</span>
        {removable && (
          <button
            type="button"
            aria-label={`Remove blocker ${id}`}
            onClick={() => actions.unblock(task, id)}
            className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/dep:opacity-100 hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        )}
      </div>
    );
  };
  return (
    <Section
      title="Dependencies"
      count={unsatisfied.length ? <span className="text-warning">{unsatisfied.length} open</span> : undefined}
      right={<AddBlocker task={task} actions={actions} open={adding} setOpen={setAdding} />}
    >
      {task.blocked_by.length > 0 && (
        <>
          <div className="mb-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">Blocked by</div>
          <div className="-mx-1.5 mb-2">{task.blocked_by.map((id) => row(id, true))}</div>
        </>
      )}
      {task.blocks.length > 0 && (
        <>
          <div className="mb-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">Blocks</div>
          <div className="-mx-1.5">{task.blocks.map((id) => row(id, false))}</div>
        </>
      )}
    </Section>
  );
}

function AddBlocker({ task, actions, open, setOpen }: { task: Task; actions: TaskActions; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <PlusIcon /> Blocker
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <TaskPickerContent
          placeholder="Blocked by…"
          exclude={[task.id, ...task.blocked_by]}
          onPick={(b) => {
            actions.block(task, b.id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---------------------------------------------------------- activity */

interface Event {
  at: string;
  who: string | null;
  kind: "created" | "updated" | "claimed" | "completed" | "comment";
  comment?: Comment;
}

function Activity({ task }: { task: Task }) {
  const client = useQueryClient();
  const members = useMemberMap();
  const comments = useMemo(() => parseComments(splitBody(task.body).rest), [task.body]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const events = useMemo(() => {
    const ev: Event[] = [];
    if (task.created) ev.push({ at: task.created, who: task.owner, kind: "created" });
    for (const c of comments) ev.push({ at: c.at, who: c.actor, kind: "comment", comment: c });
    if (task.claimed_by && task.status === "claimed") ev.push({ at: task.updated ?? "", who: task.claimed_by, kind: "claimed" });
    if (task.completed) ev.push({ at: task.completed, who: null, kind: "completed" });
    if (task.updated && task.updated !== task.created && !(task.status === "claimed" && task.claimed_by)) ev.push({ at: task.updated, who: null, kind: "updated" });
    return ev.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  }, [task, comments]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await taskAppend(task.id, body, { section: "Comments", timestamp: true });
      setText("");
      await client.invalidateQueries({ queryKey: qk.tasks.detail(task.id) });
    } catch (e) {
      toast.error(`Couldn’t add comment: ${errorText(e)}`);
    } finally {
      setSending(false);
    }
  };

  const who = (id: string | null) => (id ? (members.get(id)?.name ?? id) : "Someone");

  return (
    <Section title="Activity" count={comments.length ? `${comments.length} comment${comments.length > 1 ? "s" : ""}` : undefined}>
      <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-px before:bg-border">
        {events.map((e, i) =>
          e.kind === "comment" && e.comment ? (
            <li key={`c-${i}`} className="relative flex gap-2.5">
              {e.who ? <MemberAvatar id={e.who} size="sm" className="mt-0.5" /> : <Avatar id="?" kind="human" size="sm" className="mt-0.5" />}
              <div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
                <div className="mb-0.5 flex items-center gap-2 text-xs">
                  <span className="font-medium">{who(e.who)}</span>
                  {e.at && (
                    <span className="text-muted-foreground" title={e.at}>
                      {relativeTime(e.at)}
                    </span>
                  )}
                </div>
                <Markdown className="text-small">{e.comment.text}</Markdown>
              </div>
            </li>
          ) : (
            <li key={`${e.kind}-${i}`} className="relative flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="relative z-[1] flex size-5 items-center justify-center rounded-full border bg-background">
                {e.kind === "completed" ? (
                  <CheckCircle2Icon className="size-3 text-success" />
                ) : e.kind === "claimed" ? (
                  <HandIcon className="size-3 text-foreground" />
                ) : e.kind === "created" ? (
                  <PlusIcon className="size-3" />
                ) : (
                  <PencilIcon className="size-3" />
                )}
              </span>
              <span className="min-w-0 truncate">
                {e.kind === "created" && (
                  <>
                    Created{e.who && <> · owner <span className="text-foreground/80">{who(e.who)}</span></>}
                  </>
                )}
                {e.kind === "claimed" && (
                  <>
                    <span className="text-foreground/80">{who(e.who)}</span> is working on this
                  </>
                )}
                {e.kind === "completed" && "Completed"}
                {e.kind === "updated" && "Last updated"}
              </span>
              <span className="ml-auto shrink-0 tabular-nums" title={e.at}>
                {relativeTime(e.at)}
              </span>
            </li>
          ),
        )}
      </ol>
      <div className="group/comment mt-4">
      <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Enter sends (the quick-add and chat habit); Shift+Enter is a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="min-h-6 flex-1 resize-none bg-transparent text-small leading-6 outline-none placeholder:text-muted-foreground/70"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" className="rounded-full" disabled={!text.trim() || sending} onClick={() => void send()} aria-label="Send comment">
              <SendHorizontalIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Comment <Kbd keys="enter" inverted className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 hidden px-1 text-micro text-muted-foreground group-focus-within/comment:block">
        <Kbd keys="enter" /> to send · <Kbd keys="shift+enter" /> new line
      </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ footer */

function Footer({ task }: { task: Task }) {
  const copy = (v: string, what: string) =>
    void navigator.clipboard?.writeText(v).then(
      () => toast.success(`Copied ${what}`),
      () => toast.error("Clipboard unavailable"),
    );
  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, "d MMM yyyy, HH:mm");
  };
  return (
    <footer className="border-t px-5 py-4 text-micro text-muted-foreground">
      <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5">
        <dt>ID</dt>
        <dd className="flex items-center gap-1">
          <span className="font-mono text-foreground/80">{task.id}</span>
          <button type="button" onClick={() => copy(task.id, "id")} className="rounded p-0.5 hover:bg-accent hover:text-foreground" aria-label="Copy id">
            <CopyIcon className="size-3" />
          </button>
        </dd>
        {task.path && (
          <>
            <dt>File</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono" title={task.path}>
                {task.path.replace(/^.*?\/(tasks\/)/, "$1")}
              </span>
              <button type="button" onClick={() => copy(task.path ?? "", "path")} className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-foreground" aria-label="Copy path">
                <LinkIcon className="size-3" />
              </button>
            </dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{fmt(task.created)}</dd>
        <dt>Updated</dt>
        <dd>{fmt(task.updated)}</dd>
        {task.completed && (
          <>
            <dt>Completed</dt>
            <dd>{fmt(task.completed)}</dd>
          </>
        )}
      </dl>
    </footer>
  );
}
