/**
 * Agent overview: needs-you tasks, compact crew rows, people and recent memories. Member detail
 * keeps the full queues and activity timeline.
 */
import { ArrowLeftIcon, BotIcon, PlugIcon, TriangleAlertIcon, UserPlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { HeaderActions, useHeaderTitle } from "@/app/header";
import { AgentCard } from "@/components/agent/AgentCard";
import { AssignTaskDialog } from "@/components/agent/AssignTaskDialog";
import { AgentCrewRow, NeedsYouSection, PeopleSection, RecentMemoriesSection } from "@/components/agent/AgentsOverview";
import { useBoard, READY_ARGS } from "@/components/agent/hooks";
import { useNow } from "@/components/agent/primitives";
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
  const { board, me, loading, error, memories } = useBoard(now);
  const ready = useTasks({ ...READY_ARGS });
  const readyIds = useMemo(() => (ready.data ? new Set(ready.data.map((t) => t.id)) : undefined), [ready.data]);
  const projects = useProjects().data ?? [];
  const projectTitle = (pid: string | null) => (pid ? (projects.find((p) => p.id === pid)?.title ?? pid) : null);
  const [assignTo, setAssignTo] = useState<Member | null>(null);

  const focused = id ? [...board.agents, ...board.humans].find((c) => c.member.id === id) : undefined;
  useHeaderTitle(focused ? focused.member.name : null);

  const firstAgent = board.agents[0]?.member ?? null;

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

      <div className="mx-auto max-w-5xl space-y-8 pb-8">
        {!loading && <NeedsYouSection agents={board.agents} />}

        <section aria-labelledby="agents-heading">
          <div className="mb-3 flex items-center gap-2">
            <BotIcon className="size-4 text-muted-foreground" />
            <h2 id="agents-heading" className="text-sm font-semibold">Crew</h2>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{board.agents.length}</span>
          </div>
          {loading ? (
            <div className="space-y-2 rounded-xl border bg-card p-3" aria-busy="true" aria-label="Loading agents">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : board.agents.length === 0 ? (
            <div className="rounded-xl border border-dashed">
              <EmptyState
                icon={PlugIcon}
                title="No agents yet"
                description={<>Connect an agent through your Shards MCP configuration. Agents appear here when they own or claim work, write a memory or keep a scratchpad.</>}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {board.agents.map((card) => <AgentCrewRow key={card.member.id} card={card} onAssign={setAssignTo} />)}
            </div>
          )}
        </section>

        {!loading && <PeopleSection people={board.humans} me={me} />}
        {!loading && <RecentMemoriesSection memories={memories} />}

        {!loading && board.agents.length > 0 && (
          <section aria-labelledby="agent-details-heading">
            <div className="mb-3 flex items-center gap-2">
              <h2 id="agent-details-heading" className="text-sm font-semibold">Queues and activity</h2>
              <span className="text-xs text-muted-foreground">Open a crew member for full details</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {board.agents.map((card) => (
                <Link key={card.member.id} to={paths.agents(card.member.id)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-row-hover hover:text-foreground">
                  {card.member.name} <span className="font-mono">· {card.claimed.length} working · {card.queue.length} queued</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <AssignTaskDialog member={assignTo} open={!!assignTo} onOpenChange={(o) => !o && setAssignTo(null)} />
    </div>
  );
}
