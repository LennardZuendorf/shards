/**
 * One task in a list (or, `variant="card"`, on a board): priority checkbox, inline-renamable
 * title, description preview, a chips row and hover actions. Completing animates the check, then
 * the row fades out; the Undo toast reopens it.
 */
import {
  CalendarIcon,
  ChevronRightIcon,
  CornerLeftUpIcon,
  EllipsisIcon,
  FlagIcon,
  GitForkIcon,
  GripVerticalIcon,
  HashIcon,
  InboxIcon,
  LockIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { MemberAvatar } from "@/components/shared/Avatar";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { LabelChip } from "@/components/shared/LabelChip";
import { PriorityCheckbox } from "@/components/shared/PriorityCheckbox";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openTask, useDetail } from "@/app/detail";
import { entityColor } from "@/lib/color";
import { guessMemberKind } from "@/lib/api/host";
import { useMemberMap } from "@/lib/hooks";
import { navigate, paths } from "@/lib/router";
import { sessionState } from "@/lib/status";
import type { Project, Task } from "@/lib/types";
import type { Density } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";
import { useTaskActions, type TaskActions } from "./actions";
import { useActingMe } from "./hooks";
import { descriptionPreview } from "./model";
import { LabelPickerContent, PriorityItems, ProjectPickerContent, ScheduleContent } from "./pickers";
import { TaskMenuItems } from "./TaskMenu";
import {
  completeAnimated,
  select,
  startEditing,
  useIsCompleting,
  useIsEditing,
  useHasSelection,
  useIsSelected,
  useRegisterRow,
  openRowPicker,
  useRowPicker,
  isKeyboardDrag,
  clearMulti,
  rangeTo,
  toggleMulti,
  useIsMultiSelected,
} from "./selection";

export interface DragHandle {
  ref?: Ref<HTMLElement>;
  attributes?: HTMLAttributes<HTMLElement>;
  listeners?: Record<string, (e: never) => void>;
}

export interface TaskRowProps {
  task: Task;
  depth?: number;
  /** Direct + nested subtasks under this row (count chip + collapse chevron). */
  subtaskCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Show "# Project / section" on the chips row (off inside a project view). */
  showProject?: boolean;
  /** Show the section even when the project is hidden. */
  showSection?: boolean;
  /** Title of a parent that is not in this list (breadcrumb). */
  parentTitle?: string | null;
  /** Unsatisfied blocker count. */
  blockedCount?: number;
  project?: Project | null;
  /** Search hit highlighting for the title. */
  renderTitle?: (title: string) => ReactNode;
  variant?: "row" | "card";
  /** dnd-kit sortable wiring (whole row drags after a 4px move). */
  drag?: DragHandle & { style?: React.CSSProperties; isDragging?: boolean; isOverlay?: boolean };
  /** Show the date chip (off in a day group where every row has the same day). */
  showDue?: boolean;
  /** Compact: 32px rows, no description preview; metadata stays on the second line. */
  density?: Density;
}

function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground", className)}>
      {children}
    </span>
  );
}

function InlineTitle({ task, actions, onDone }: { task: Task; actions: TaskActions; onDone: () => void }) {
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) actions.rename(task, value);
    onDone();
  };
  return (
    <input
      ref={ref}
      value={value}
      aria-label="Task name"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          commit(false);
        }
      }}
      onBlur={() => commit(true)}
      className="-mx-1 -my-0.5 w-full rounded-md bg-background px-1 py-0.5 text-body leading-5 ring-2 ring-ring outline-none"
    />
  );
}

function HoverAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const iconBtn =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground";

function TaskRowImpl({
  task,
  depth = 0,
  subtaskCount = 0,
  collapsed,
  onToggleCollapse,
  showProject = true,
  showSection = false,
  parentTitle,
  blockedCount = 0,
  project,
  renderTitle,
  variant = "row",
  drag,
  showDue = true,
  density = "comfortable",
}: TaskRowProps) {
  const actions = useTaskActions();
  const members = useMemberMap();
  const me = useActingMe();
  const { isOpen } = useDetail();
  const selected = useIsSelected(task.id);
  const picked = useIsMultiSelected(task.id);
  const anySelected = useHasSelection();
  const editing = useIsEditing(task.id);
  const completing = useIsCompleting(task.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  useRegisterRow(task);

  const done = task.status === "done" || task.status === "cancelled";
  const checked = done || completing;
  const open = isOpen("task", task.id);
  const card = variant === "card";
  const compact = density === "compact" && variant === "row";
  const preview = compact ? "" : descriptionPreview(task.body);

  const claimer = task.claimed_by;
  const claimerKind = claimer ? (members.get(claimer)?.kind ?? guessMemberKind(claimer, actions.me)) : null;
  const state = sessionState(task);
  const agentWork = claimer && claimerKind === "agent";

  const onCheck = () => {
    if (done) {
      actions.reopen(task);
      return;
    }
    completeAnimated(task, actions.complete);
  };

  const projectChip =
    showProject || (showSection && task.section) ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(task.project ? paths.project(task.project) : paths.inbox());
        }}
        className="inline-flex max-w-48 min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {showProject && (
          <>
            {task.project ? (
              <HashIcon className="size-3 shrink-0" style={{ color: entityColor(task.project, project?.color) }} />
            ) : (
              <InboxIcon className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{task.project ? (project?.title ?? task.project) : "Inbox"}</span>
          </>
        )}
        {task.section && (
          <span className="truncate text-muted-foreground">
            {showProject && <span className="mx-0.5 text-muted-foreground/50">/</span>}
            {task.section}
          </span>
        )}
      </button>
    ) : null;

  const owner = task.owner;
  const people: string[] = [];
  if (owner && owner !== me) people.push(owner);
  if (claimer && claimer !== owner) people.push(claimer);

  const chips: ReactNode[] = [];
  if (showDue && task.due) chips.push(<DueChip key="due" due={task.due} recur={task.recur} recurFrom={task.recur_from} />);
  else if (task.recur) chips.push(<DueChip key="due" due={task.due} recur={task.recur} recurFrom={task.recur_from} />);
  if (task.deadline) chips.push(<DeadlineChip key="deadline" deadline={task.deadline} />);
  if (subtaskCount > 0)
    chips.push(
      <Chip key="sub" title={`${subtaskCount} subtask${subtaskCount > 1 ? "s" : ""}`}>
        <GitForkIcon className="size-3 rotate-180" />
        {subtaskCount}
      </Chip>,
    );
  if (blockedCount > 0)
    chips.push(
      <Chip key="blocked" title={`Blocked by ${blockedCount} open task${blockedCount > 1 ? "s" : ""}`} className="text-warning">
        <LockIcon className="size-3" />
        Blocked
      </Chip>,
    );
  if (agentWork && (state === "awaiting" || state === "error")) chips.push(<StatusBadge key="state" state={state} className="h-[18px] px-1.5 text-micro" />);
  for (const l of task.tags) chips.push(<LabelChip key={`l-${l}`} name={l} />);

  const hasMeta = chips.length > 0 || !!projectChip;
  const avatars = (size: "xs" | "sm") =>
    people.map((id) => (
      <MemberAvatar key={id} id={id} size={size} tooltip active={id === claimer && state === "working" && claimerKind === "agent"} />
    ));

  const body = (
    <div
      ref={drag?.ref as Ref<HTMLDivElement>}
      {...(drag?.attributes ?? {})}
      {...((drag?.listeners ?? {}) as HTMLAttributes<HTMLDivElement>)}
      data-task-row={drag?.isOverlay ? undefined : task.id}
      data-density={compact ? "compact" : undefined}
      data-selected={selected || undefined}
      data-picked={picked || undefined}
      // A list item, not an option: rows hold a checkbox and menu buttons, which an option
      // cannot. Roving tabindex: the selected row (or every row while none is) is the tab stop,
      // j/k move DOM focus, and Enter/Space open the detail.
      role="listitem"
      // dnd-kit's attributes describe a "sortable" button; the row stays a plain list item for
      // assistive tech. Keyboard drag starts with Shift/Alt+Space (Space alone opens the task).
      aria-roledescription={undefined}
      aria-describedby={undefined}
      aria-pressed={undefined}
      aria-disabled={undefined}
      aria-label={task.title}
      aria-current={selected ? "true" : undefined}
      tabIndex={drag?.isOverlay ? -1 : selected || !anySelected ? 0 : -1}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !drag?.isOverlay) select(task.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || editing) return;
        if (e.code === "Space" && (e.shiftKey || e.altKey) && drag?.listeners?.onKeyDown) {
          (drag.listeners.onKeyDown as (ev: React.KeyboardEvent) => void)(e);
          return;
        }
        if (isKeyboardDrag()) return;
        if (e.key === " ") {
          e.preventDefault();
          openTask(task.id);
        }
      }}
      style={{ ...drag?.style, ...(card ? {} : { paddingLeft: depth ? `${depth * 28}px` : undefined }) }}
      onClick={(e) => {
        // ⌘/Ctrl-click toggles a row into the selection, Shift-click selects a range.
        if (!drag?.isOverlay && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          toggleMulti(task.id);
          return;
        }
        if (!drag?.isOverlay && e.shiftKey) {
          e.preventDefault();
          window.getSelection()?.removeAllRanges();
          rangeTo(task.id);
          return;
        }
        clearMulti();
        select(task.id);
        if (!editing) openTask(task.id);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        startEditing(task.id);
      }}
      className={cn(
        "group/row relative outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        card
          ? "rounded-lg border bg-card px-3 py-2.5 shadow-elevation-1 transition-[box-shadow,border-color,background-color] hover:border-foreground/15 hover:shadow-elevation-1"
          : "transition-colors",
        !card &&
          (selected || open
            ? "bg-row-selected before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-foreground"
            : "hover:bg-row-hover"),
        card && (selected || open) && "border-ring ring-1 ring-ring",
        picked && (card ? "border-ring bg-row-selected" : "bg-row-selected"),
        drag?.isDragging && "opacity-40",
        drag?.isOverlay && (card ? "rotate-[1.5deg] shadow-elevation-3" : "rounded-lg border bg-background shadow-elevation-3"),
        (completing || done) && "text-muted-foreground",
        completing && !task.recur && "animate-out fade-out-0 fill-mode-forwards [animation-delay:250ms] [animation-duration:350ms]",
      )}
    >
      {!card && (
        <span
          aria-hidden
          className="absolute top-1/2 -left-5 hidden -translate-y-1/2 cursor-grab text-muted-foreground/40 group-hover/row:block active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-3.5" />
        </span>
      )}
      {!drag?.isOverlay && <RowPickerPopover task={task} actions={actions} />}
      <div className={cn("flex items-start gap-2.5", !card && (compact ? "py-1.5 pr-1" : "py-2 pr-1"))}>
        {!card && subtaskCount > 0 && onToggleCollapse ? (
          <button
            type="button"
            aria-label={collapsed ? "Expand subtasks" : "Collapse subtasks"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            className="absolute -ml-6 inline-flex size-[18px] items-center justify-center rounded text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
            style={{ left: depth ? `${depth * 28}px` : 0, top: compact ? 7 : 11 }}
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform duration-150", !collapsed && "rotate-90")} />
          </button>
        ) : null}
        <PriorityCheckbox
          priority={task.priority}
          checked={checked}
          recurring={!!task.recur}
          onCheckedChange={onCheck}
          className="mt-px"
          aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
        />
        <div className="min-w-0 flex-1">
          {parentTitle && (
            <div className="mb-0.5 flex items-center gap-1 text-micro text-muted-foreground">
              <CornerLeftUpIcon className="size-3" />
              <span className="truncate">{parentTitle}</span>
            </div>
          )}
          <div className="flex min-h-5 items-start gap-2">
            <div
              className={cn(
                "min-w-0 flex-1 text-body leading-5 break-words",
                card && "text-small",
                checked && "line-through decoration-muted-foreground/60",
                task.status === "cancelled" && "opacity-70",
              )}
            >
              {editing ? (
                <InlineTitle task={task} actions={actions} onDone={() => startEditing(null)} />
              ) : renderTitle ? (
                renderTitle(task.title)
              ) : (
                task.title
              )}
            </div>
            {people.length > 0 && (!hasMeta || !card) && (
              <span className={cn("mt-px flex shrink-0 items-center -space-x-1", hasMeta && "sm:hidden", !card && "group-hover/row:invisible")}>
                {avatars("sm")}
              </span>
            )}
          </div>
          {preview && !card && <div className="mt-0.5 truncate text-micro leading-[18px] text-muted-foreground">{preview}</div>}
          {hasMeta && (
            <div className={cn("mt-1 flex min-w-0 gap-x-3 gap-y-1", card ? "items-end" : "flex-wrap items-center sm:flex-nowrap")}>
              {/* Cards: chips wrap inside their column so avatars stay on the last chip line. */}
              <div className={cn("flex min-w-0 flex-wrap items-center gap-y-1", card ? "flex-1 gap-x-2.5" : "gap-x-3")}>{chips}</div>
              {(projectChip || people.length > 0) && (
                <div className="ml-auto flex shrink-0 items-center gap-2.5">
                  {projectChip}
                  {people.length > 0 && <span className={cn("items-center -space-x-1", card ? "flex" : "hidden sm:flex")}>{avatars("sm")}</span>}
                </div>
              )}
            </div>
          )}
          {task.body && card && preview && (
            <div className="mt-1 flex items-center gap-1 text-micro text-muted-foreground">
              <MessageSquareTextIcon className="size-3" /> {preview}
            </div>
          )}
        </div>
        {/* hover actions */}
        {!editing && !drag?.isOverlay && (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={cn(
              "flex shrink-0 items-center gap-0.5 transition-opacity duration-100",
              card ? "absolute top-1.5 right-1.5 rounded-md bg-card/95 shadow-elevation-1" : "absolute top-1.5 right-0 rounded-md bg-inherit pl-1",
              menuOpen || dateOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
              selected && !card && "opacity-100",
            )}
          >
            {!card && (
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <HoverAction label="Set due date">
                  <PopoverTrigger className={iconBtn} aria-label="Set due date">
                    <CalendarIcon className="size-4" />
                  </PopoverTrigger>
                </HoverAction>
                <PopoverContent align="end" className="w-auto p-0">
                  <ScheduleContent
                    due={task.due}
                    onPick={(d) => actions.schedule(task, d)}
                    recur={task.recur}
                    recurFrom={task.recur_from}
                    onRecur={(r, f) => actions.setRecur(task, r, f)}
                    onDone={() => setDateOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            )}
            {!card && (
              <DropdownMenu>
                <HoverAction label="Priority">
                  <DropdownMenuTrigger className={iconBtn} aria-label="Priority">
                    <FlagIcon className="size-4" />
                  </DropdownMenuTrigger>
                </HoverAction>
                <DropdownMenuContent align="end" className="w-44">
                  <PriorityItems value={task.priority} onPick={(p) => actions.setPriority(task, p)} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <HoverAction label="More actions">
                <DropdownMenuTrigger className={iconBtn} aria-label="More actions">
                  <EllipsisIcon className="size-4" />
                </DropdownMenuTrigger>
              </HoverAction>
              <DropdownMenuContent align="end" className="w-60">
                <TaskMenuItems task={task} actions={actions} kind="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );

  if (drag?.isOverlay) return body;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <TaskMenuItems task={task} actions={actions} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const TaskRow = memo(TaskRowImpl);

/** The picker the keyboard opened on this row (`v` project, `s` date, `l` labels). */
function RowPickerPopover({ task, actions }: { task: Task; actions: TaskActions }) {
  const kind = useRowPicker(task.id);
  const close = () => openRowPicker(null);
  if (!kind) return null;
  return (
    <Popover open onOpenChange={(o) => !o && close()}>
      <PopoverAnchor asChild>
        <span aria-hidden className="pointer-events-none absolute right-24 bottom-0 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-auto p-0"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          // Back to the row, so j/k and the next shortcut keep working.
          e.preventDefault();
          select(task.id, { focus: true });
        }}
      >
        {kind === "project" && (
          <ProjectPickerContent
            project={task.project}
            section={task.section}
            onPick={(p, s, label) => {
              close();
              actions.moveTo(task, p, s, label);
            }}
          />
        )}
        {kind === "date" && (
          <ScheduleContent
            due={task.due}
            onPick={(d) => actions.schedule(task, d)}
            recur={task.recur}
            recurFrom={task.recur_from}
            onRecur={(r, f) => actions.setRecur(task, r, f)}
            onDone={close}
          />
        )}
        {kind === "labels" && <LabelPickerContent value={task.tags} onChange={(l) => actions.setLabels(task, l)} />}
      </PopoverContent>
    </Popover>
  );
}
