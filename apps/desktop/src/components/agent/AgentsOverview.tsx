import { ArrowUpRightIcon, BrainIcon, HandIcon, NotebookPenIcon } from "lucide-react";
import { openTask } from "@/app/detail";
import { Avatar } from "@/components/shared/Avatar";
import { Link } from "@/components/shared/Link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { paths } from "@/lib/router";
import type { Memory, Member } from "@/lib/types";
import type { IdentityCard } from "./agent-utils";
import { getNeedsYouItems } from "./agents-overview";

export function NeedsYouSection({ agents }: { agents: IdentityCard[] }) {
  const items = getNeedsYouItems({ agents });
  if (!items.length) return null;
  return (
    <section aria-labelledby="needs-you-heading" className="rounded-2xl border border-status-awaiting/30 bg-status-awaiting/8 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <HandIcon className="size-4 text-status-awaiting" />
        <h2 id="needs-you-heading" className="text-sm font-semibold">Needs you</h2>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      <ul className="divide-y divide-status-awaiting/15">
        {items.map(({ member, task }) => (
          <li key={`${member.id}:${task.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
            <Avatar id={member.id} kind={member.kind} name={member.name} color={member.color} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{member.name}</span>
                <StatusBadge state="awaiting" label="Needs input" />
              </div>
              <button type="button" onClick={() => openTask(task.id)} className="mt-1 block max-w-full truncate text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={task.title}>
                {task.title || "Untitled task"}
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => openTask(task.id)}>
              Open task <ArrowUpRightIcon />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CurrentWork({ card }: { card: IdentityCard }) {
  const work = card.claimed.length ? card.claimed : card.queue.slice(0, 1);
  if (!work.length) return <span className="text-xs text-muted-foreground">No current task</span>;
  return (
    <ul className="min-w-0 space-y-1">
      {work.slice(0, 2).map((task) => (
        <li key={task.id}>
          <button type="button" onClick={() => openTask(task.id)} className="block max-w-full truncate text-left text-[13px] hover:underline" title={task.title}>
            {task.title || "Untitled task"}
          </button>
        </li>
      ))}
      {work.length > 2 && <li className="text-xs text-muted-foreground">+{work.length - 2} more</li>}
    </ul>
  );
}

export function AgentCrewRow({ card, isMe, onAssign }: { card: IdentityCard; isMe?: boolean; onAssign: (member: Member) => void }) {
  const m = card.member;
  return (
    <article className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-border/70 px-3 py-3 last:border-b-0 xl:grid-cols-[auto_minmax(140px,0.8fr)_minmax(140px,1.3fr)_auto] xl:gap-4 xl:px-4">
      <Avatar id={m.id} kind={m.kind} name={m.name} color={m.color} size="lg" active={card.state === "working"} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link to={paths.agents(m.id)} className="truncate text-sm font-semibold hover:underline">{m.name}</Link>
          {isMe && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">You</span>}
          <StatusBadge state={card.state} />
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{m.id}</p>
      </div>
      <div className="col-span-2 min-w-0 xl:col-span-1">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">Current task</p>
        <CurrentWork card={card} />
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-1 xl:col-span-1 xl:justify-end xl:pl-0">
        <Link to={`${paths.memories()}?owner=${encodeURIComponent(m.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <BrainIcon className="size-3.5" /> {card.memories} memories
        </Link>
        <Link to={paths.scratch(m.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <NotebookPenIcon className="size-3.5" /> {card.scratch} scratchpads
        </Link>
        <Button variant="ghost" size="sm" onClick={() => onAssign(m)}>Assign</Button>
      </div>
    </article>
  );
}

export function PeopleSection({ people, me }: { people: IdentityCard[]; me: string | null }) {
  if (!people.length) return null;
  return (
    <section aria-labelledby="people-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="people-heading" className="text-sm font-semibold">People</h2>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{people.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {people.map((card) => (
          <Link key={card.member.id} to={paths.agents(card.member.id)} className="inline-flex min-w-0 items-center gap-2 rounded-full border bg-card py-1.5 pr-3 pl-1.5 text-sm hover:bg-row-hover">
            <Avatar id={card.member.id} kind="human" name={card.member.name} color={card.member.color} size="md" />
            <span className="max-w-40 truncate font-medium">{card.member.name}</span>
            {card.member.id === me && <span className="text-xs text-muted-foreground">You</span>}
            <span className="font-mono text-xs text-muted-foreground">{card.doneToday} today</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function RecentMemoriesSection({ memories }: { memories: Memory[] }) {
  const recent = memories.slice(0, 3);
  return (
    <section aria-labelledby="recent-memories-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="recent-memories-heading" className="text-sm font-semibold">Recently remembered</h2>
        <Link to={paths.memories()} className="ml-auto text-xs text-muted-foreground hover:text-foreground">All memories</Link>
      </div>
      {recent.length ? (
        <ul className="divide-y divide-border/70 rounded-xl border bg-card">
          {recent.map((memory) => (
            <li key={memory.id} className="grid min-w-0 gap-1 px-3 py-2.5 sm:grid-cols-[minmax(110px,0.3fr)_minmax(0,1fr)] sm:gap-4 sm:px-4">
              <Link to={paths.memories(memory.id)} className="truncate font-mono text-xs text-muted-foreground hover:text-foreground">{memory.owner ?? "Shared"}</Link>
              <Link to={paths.memories(memory.id)} className="line-clamp-2 text-[13px] hover:underline" title={memory.title}>
                {memory.snippet ?? memory.body ?? memory.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">No memories available yet.</p>}
    </section>
  );
}
