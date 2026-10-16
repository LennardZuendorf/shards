/**
 * Delegation board (D4): one card per agent and per human — what they are working on, what is
 * waiting on you, their queue and recent activity — plus a summary row and quick assignment.
 */
import { ArrowLeftIcon, BotIcon, CheckCircle2Icon, HandIcon, LoaderIcon, PlugIcon, TriangleAlertIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { HeaderActions, useHeaderTitle } from "@/app/header";
import { AgentCard } from "@/components/agent/AgentCard";
import { AssignTaskDialog } from "@/components/agent/AssignTaskDialog";
import { useBoard, READY_ARGS } from "@/components/agent/hooks";
import { StatTile, useNow } from "@/components/agent/primitives";
import "@/components/memory/register";
import "@/components/note/register";
import "@/components/scratch/register";
import { Avatar } from "@/components/shared/Avatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { PAGE_WIDTH } from "@/components/shared/page-width";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "@/components/shared/Link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects, useTasks } from "@/lib/hooks";
import { paths, useRouteParams } from "@/lib/router";
import type { Member } from "@/lib/types";

export function AgentsView() {
  const { id } = useRouteParams<{ id?: string }>();
  const now = useNow();
  const { board, me, loading, error } = useBoard(now);
  const ready = useTasks({ ...READY_ARGS });
  const readyIds = useMemo(() => (ready.data ? new Set(ready.data.map((t) => t.id)) : undefined), [ready.data]);
  const projects = useProjects().data ?? [];
  const projectTitle = (pid: string | null) => (pid ? (projects.find((p) => p.id === pid)?.title ?? pid) : null);
  const [assignTo, setAssignTo] = useState<Member | null>(null);

  const focused = id ? [...board.agents, ...board.humans].find((c) => c.member.id === id) : undefined;
  useHeaderTitle(focused ? focused.member.name : null);

  const firstAgent = board.agents[0]?.member ?? null;
  const awaitingFirst = board.agents.find((c) => c.awaiting.length > 0);

  if (error) {
    return <EmptyState icon={TriangleAlertIcon} tone="muted" title="Couldn’t load the board" description={(error as Error).message} />;
  }

  if (id) {
    return (
      <div className={PAGE_WIDTH.list}>
        <Link to={paths.agents()} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> All agents & people
        </Link>
        {loading ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : focused ? (
          <AgentCard card={focused} now={now} readyIds={readyIds} projectTitle={projectTitle} expanded isMe={focused.member.id === me} onAssign={setAssignTo} />
        ) : (
          <EmptyState compact icon={BotIcon} tone="muted" title={`No one called “${id}”`} description="They may not own or have touched anything in this vault yet." />
        )}
        <AssignTaskDialog member={assignTo} open={!!assignTo} onOpenChange={(o) => !o && setAssignTo(null)} />
      </div>
    );
  }

  return (
    <div className={PAGE_WIDTH.wide}>
      <PageHeader
        title="Agents"
        subtitle={
          loading ? null : (
            <span>
              {board.agents.length} agent{board.agents.length === 1 ? "" : "s"} · {board.humans.length} {board.humans.length === 1 ? "person" : "people"}
            </span>
          )
        }
      />
      <HeaderActions>
        {firstAgent && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                <UserPlusIcon /> Assign to agent
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Hand a task to…</DropdownMenuLabel>
              {board.agents.map((c) => (
                <DropdownMenuItem key={c.member.id} onSelect={() => setAssignTo(c.member)}>
                  <Avatar id={c.member.id} kind={c.member.kind} name={c.member.name} color={c.member.color} size="xs" />
                  <span className="truncate">{c.member.name}</span>
                  <StatusBadge state={c.state} compact className="ml-auto" />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </HeaderActions>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={LoaderIcon} tone="working" label="Agents working" value={board.summary.agentsWorking} loading={loading} />
        <StatTile icon={BotIcon} tone="brand" label="Tasks in progress" value={board.summary.inProgress} loading={loading} />
        <StatTile
          icon={HandIcon}
          tone="awaiting"
          label="Awaiting your input"
          value={board.summary.awaitingYou}
          loading={loading}
          onClick={awaitingFirst ? () => document.getElementById(`agent-${awaitingFirst.member.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined}
        />
        <StatTile icon={CheckCircle2Icon} tone="done" label="Done today" value={board.summary.doneToday} loading={loading} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <BotIcon className="size-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold tracking-tight">Agents</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{board.agents.length}</span>
        </div>
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : board.agents.length === 0 ? (
          <div className="rounded-xl border border-dashed">
            <EmptyState
              icon={PlugIcon}
              title="No agents yet"
              description={
                <>
                  Connect an agent and it shows up here the moment it owns or claims a task, writes a memory or keeps a scratchpad. Add the Shards MCP server to Claude Code, Cursor or Codex, or
                  assign a task to an agent id below.
                </>
              }
              action={
                <code className="rounded-lg border bg-muted/50 px-3 py-1.5 font-mono text-xs">claude mcp add shards -- shards-mcp</code>
              }
            />
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {board.agents.map((c) => (
              <AgentCard key={c.member.id} card={c} now={now} readyIds={readyIds} projectTitle={projectTitle} onAssign={setAssignTo} />
            ))}
          </div>
        )}
      </section>

      {!loading && board.humans.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <UsersIcon className="size-4 text-muted-foreground" />
            <h2 className="text-[15px] font-semibold tracking-tight">People</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{board.humans.length}</span>
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {board.humans.map((c) => (
              <AgentCard key={c.member.id} card={c} now={now} readyIds={readyIds} projectTitle={projectTitle} isMe={c.member.id === me} onAssign={setAssignTo} />
            ))}
          </div>
        </section>
      )}

      <AssignTaskDialog member={assignTo} open={!!assignTo} onOpenChange={(o) => !o && setAssignTo(null)} />
    </div>
  );
}
