/** One identity on the delegation board: state, claimed work, waiting items, queue, activity. */
import {
  ArrowRightLeftIcon,
  BrainIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  FileTextIcon,
  HandIcon,
  LockIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PlusIcon,
  UndoIcon,
  UserPlusIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { openTask } from "@/app/detail";
import { openQuickAdd } from "@/app/quickadd-store";
import { Avatar, MemberAvatar } from "@/components/shared/Avatar";
import { DueChip } from "@/components/shared/DueChip";
import { Link } from "@/components/shared/Link";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/dates";
import { useMembers } from "@/lib/hooks";
import { useClaimTask, useUpdateTask } from "@/lib/query";
import { navigate, paths } from "@/lib/router";
import type { ActivityRow, Member, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { IdentityCard } from "./agent-utils";

/**
 * Reassign submenu (owner → another identity). A claimed task is released first, so the old
 * delegate stops showing it as "Working on" (the new owner claims it when they start).
 */
function ReassignMenu({ task }: { task: Task }) {
  const members = useMembers().data ?? [];
  const update = useUpdateTask({ undoable: true, message: (t) => `Reassigned “${t.title}”` });
  const claim = useClaimTask();
  const reassign = async (owner: string) => {
    if (task.status === "claimed" && task.claimed_by && task.claimed_by !== owner) {
      try {
        await claim.mutateAsync({ task, claimer: task.claimed_by, release: true });
      } catch {
        return; // the mutation cache already toasted the error
      }
    }
    update.mutate({ task: { ...task, status: "open", claimed_by: null }, args: { owner } });
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowRightLeftIcon /> Reassign to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
        {members
          .filter((m) => m.id !== task.owner)
          .map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => void reassign(m.id)}>
              <Avatar id={m.id} kind={m.kind} name={m.name} color={m.color} size="xs" /> {m.name}
              {m.kind === "agent" && <span className="ml-auto text-micro text-muted-foreground">agent</span>}
            </DropdownMenuItem>
          ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function TaskMini({ task, variant, ready, projectTitle }: { task: Task; variant?: "working" | "awaiting" | "queue"; ready?: boolean; projectTitle?: string | null }) {
  const claim = useClaimTask();
  const blocked = variant === "queue" && ready === false;
  return (
    <div className="group/task relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1 hover:bg-row-hover">
      <span className="grid w-4 shrink-0 place-items-center">
        {variant === "working" ? (
          <CircleDotIcon className="size-3.5 animate-pulse text-status-working" />
        ) : variant === "awaiting" ? (
          <HandIcon className="size-3.5 text-status-awaiting" />
        ) : blocked ? (
          <LockIcon className="size-3 text-muted-foreground" aria-label="Blocked" />
        ) : (
          <span className="size-1.5 rounded-full bg-status-done" title="Ready" />
        )}
      </span>
      <button type="button" onClick={() => openTask(task.id)} className={cn("min-w-0 flex-1 truncate text-left text-small hover:underline", blocked && "text-muted-foreground")} title={task.title}>
        {task.title}
      </button>
      <span className="flex shrink-0 items-center gap-1.5 group-hover/task:hidden">
        {projectTitle && <span className="hidden max-w-24 truncate text-micro text-muted-foreground sm:inline">{projectTitle}</span>}
        <DueChip due={task.due} />
        <PriorityFlag priority={task.priority} />
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover/task:flex group-focus-within/task:flex">
        {task.status === "claimed" && task.claimed_by && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Release claim" onClick={() => claim.mutate({ task, claimer: task.claimed_by ?? undefined, release: true })}>
                <UndoIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Release — back to the queue</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Task actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => openTask(task.id)}>
              <FileTextIcon /> Open task
            </DropdownMenuItem>
            {task.status === "claimed" && task.claimed_by && (
              <DropdownMenuItem onSelect={() => claim.mutate({ task, claimer: task.claimed_by ?? undefined, release: true })}>
                <UndoIcon /> Release claim
              </DropdownMenuItem>
            )}
            <ReassignMenu task={task} />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}

function Block({ title, count, tone, children, more }: { title: string; count: number; tone?: "awaiting" | "working"; children: ReactNode; more?: ReactNode }) {
  return (
    <div className={cn("rounded-lg", tone === "awaiting" && "bg-status-awaiting/8 ring-1 ring-status-awaiting/25 ring-inset")}>
      <div className={cn("flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-micro font-semibold tracking-wide uppercase", tone === "awaiting" ? "text-status-awaiting" : "text-muted-foreground")}>
        {title}
        <span className="font-normal tabular-nums">{count}</span>
      </div>
      <div className="pb-1">{children}</div>
      {more}
    </div>
  );
}

function activityHref(a: ActivityRow): (() => void) | null {
  if (!a.id) return null;
  if (a.id.startsWith("t-")) return () => openTask(a.id ?? "");
  if (a.id.startsWith("m-")) return () => navigate(paths.memories(a.id ?? undefined));
  if (a.id.startsWith("n-")) return () => navigate(paths.notes(a.id ?? undefined));
  return null;
}

export function ActivityTimeline({ rows, now, limit = 4 }: { rows: ActivityRow[]; now: Date; limit?: number }) {
  if (!rows.length) return <p className="px-2 py-1 text-xs text-muted-foreground">No activity in the last 7 days.</p>;
  return (
    <ol className="relative ml-[13px] border-l border-border pl-3">
      {rows.slice(0, limit).map((a, i) => {
        const go = activityHref(a);
        const done = a.path.includes("/done/");
        return (
          <li key={`${a.path}-${i}`} className="relative py-1">
            <span className={cn("absolute top-[11px] -left-[16.5px] size-2 rounded-full ring-2 ring-card", done ? "bg-status-done" : a.claimed_by ? "bg-status-working" : "bg-muted-foreground/40")} />
            <div className="flex items-center gap-2 text-micro">
              <button type="button" disabled={!go} onClick={() => go?.()} className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline">
                {a.title ?? a.path.split("/").pop()}
              </button>
              <span className="shrink-0 text-micro text-muted-foreground tabular-nums">{relativeTime(new Date(a.mtime * 1000).toISOString(), now)}</span>
            </div>
            <div className="text-micro text-muted-foreground">
              {/* No writer is recorded on a file yet (task-model-v2 R19), so a change is never
                  attributed to anyone: only the state the file is in now is shown. */}
              {done ? "completed" : a.claimed_by ? `in progress · ${a.claimed_by}` : `${a.type ?? "file"} changed`}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface AgentCardProps {
  card: IdentityCard;
  now: Date;
  readyIds?: Set<string>;
  projectTitle: (id: string | null) => string | null;
  expanded?: boolean;
  isMe?: boolean;
  onAssign: (m: Member) => void;
}

export function AgentCard({ card, now, readyIds, projectTitle, expanded, isMe, onAssign }: AgentCardProps) {
  const m = card.member;
  const agent = m.kind === "agent";
  const queueLimit = expanded ? 50 : 3;
  const working = card.claimed.filter((t) => !card.awaiting.includes(t));
  const queue = card.queue.filter((t) => !card.awaiting.includes(t));
  return (
    <article
      id={`agent-${m.id}`}
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-elevation-1 transition-shadow hover:shadow-elevation-2",
        card.state === "awaiting" && "border-status-awaiting/40",
        card.state === "error" && "border-status-error/40",
      )}
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <Avatar id={m.id} kind={m.kind} name={m.name} color={m.color} size="lg" active={card.state === "working"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={paths.agents(m.id)} className="truncate text-heading font-semibold tracking-tight hover:underline">
              {m.name}
            </Link>
            {isMe && <span className="rounded-md bg-secondary px-1.5 text-micro font-semibold text-muted-foreground">You</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {m.name !== m.id && (
              <>
                <span className="truncate font-mono text-micro">{m.id}</span>
                <span aria-hidden>·</span>
              </>
            )}
            {m.name === m.id && <span>{agent ? "Agent" : "Person"}</span>}
            {m.name === m.id && <span aria-hidden>·</span>}
            <span className="whitespace-nowrap">{card.lastSeen ? `seen ${relativeTime(new Date(card.lastSeen).toISOString(), now)}` : "not seen yet"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {agent && <StatusBadge state={card.state} />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${m.name} actions`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">{m.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onAssign(m)}>
                <UserPlusIcon /> Assign existing task…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openQuickAdd({ owner: m.id })}>
                <PlusIcon /> New task for {m.name}…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(`${paths.memories()}?owner=${encodeURIComponent(m.id)}`)}>
                <BrainIcon /> Memories ({card.memories})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(paths.scratch(m.id))}>
                <NotebookPenIcon /> Scratchpads ({card.scratch})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {card.awaiting.length > 0 && (
          <Block title={agent ? "Awaiting your input" : "Waiting on others"} count={card.awaiting.length} tone="awaiting">
            {card.awaiting.map((t) => (
              <TaskMini key={t.id} task={t} variant="awaiting" projectTitle={projectTitle(t.project)} />
            ))}
          </Block>
        )}
        {working.length > 0 && (
          <Block title="Working on" count={working.length}>
            {working.map((t) => (
              <TaskMini key={t.id} task={t} variant="working" projectTitle={projectTitle(t.project)} />
            ))}
          </Block>
        )}
        {queue.length > 0 ? (
          <Block
            title="Up next"
            count={queue.length}
            more={
              queue.length > queueLimit && (
                <Link to={paths.agents(m.id)} className="block px-8 pb-1.5 text-xs text-muted-foreground hover:text-foreground">
                  +{queue.length - queueLimit} more
                </Link>
              )
            }
          >
            {queue.slice(0, queueLimit).map((t) => (
              <TaskMini key={t.id} task={t} variant="queue" ready={readyIds ? readyIds.has(t.id) : !t.blocked_by.length} projectTitle={projectTitle(t.project)} />
            ))}
          </Block>
        ) : (
          card.claimed.length === 0 &&
          card.awaiting.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
              <span className="flex-1">{agent ? "Nothing queued. Hand it something to do." : "Nothing assigned."}</span>
              <Button size="xs" variant="outline" onClick={() => onAssign(m)}>
                <UserPlusIcon /> Assign
              </Button>
            </div>
          )
        )}
        {(expanded || card.activity.length > 0) && (
          <div className="px-2 pt-1">
            <div className="pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase" title="Recent changes to work this identity owns or holds, by anyone">
              Activity on its work
            </div>
            <ActivityTimeline rows={card.activity} now={now} limit={expanded ? 20 : 3} />
          </div>
        )}
      </div>

      <footer className="mt-auto flex items-center gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Link to={`${paths.memories()}?owner=${encodeURIComponent(m.id)}`} className="inline-flex items-center gap-1 hover:text-foreground">
          <BrainIcon className="size-3.5" /> <span className="tabular-nums">{card.memories}</span> memories
        </Link>
        {(agent || card.scratch > 0) && (
          <Link to={paths.scratch(m.id)} className="inline-flex items-center gap-1 hover:text-foreground">
            <NotebookPenIcon className="size-3.5" /> <span className="tabular-nums">{card.scratch}</span> scratch
          </Link>
        )}
        <span className="inline-flex items-center gap-1">
          <CheckCircle2Icon className="size-3.5 text-status-done" /> <span className="tabular-nums">{card.doneToday}</span> today
        </span>
        <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => onAssign(m)}>
          <UserPlusIcon /> Assign
        </Button>
      </footer>
    </article>
  );
}

/** Small avatar row used in headers ("who is working"). */
export function WorkingStack({ cards }: { cards: IdentityCard[] }) {
  const working = cards.filter((c) => c.state === "working");
  if (!working.length) return null;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {working.slice(0, 5).map((c) => (
        <MemberAvatar key={c.member.id} id={c.member.id} size="sm" tooltip active />
      ))}
    </span>
  );
}
