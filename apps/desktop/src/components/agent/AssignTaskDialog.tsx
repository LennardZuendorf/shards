/** "Assign task to …": pick an open task (or create one) and make the identity its owner. */
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { openQuickAdd } from "@/app/quickadd-store";
import { MemberAvatar } from "@/components/shared/Avatar";
import { DueChip } from "@/components/shared/DueChip";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMemberMap, useProjects, useTasks } from "@/lib/hooks";
import { priorityRank } from "@/lib/priority";
import { useUpdateTask } from "@/lib/query";
import type { Member } from "@/lib/types";

export function AssignTaskDialog({ member, open, onOpenChange }: { member: Member | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tasks = useTasks();
  const projects = useProjects().data ?? [];
  const members = useMemberMap();
  // The dialog clears `member` on close, before the mutation's success toast runs: keep the
  // last assignee's name in state (adjusted during render, never cleared).
  const memberName = member ? member.name || member.id : null;
  const [name, setName] = useState("");
  if (memberName !== null && memberName !== name) setName(memberName);
  const update = useUpdateTask({ undoable: true, message: (t) => `Assigned “${t.title}” to ${name}` });
  const candidates = useMemo(
    () =>
      (tasks.data ?? [])
        .filter((t) => t.status === "open" && t.owner !== member?.id)
        .sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || priorityRank(a.priority) - priorityRank(b.priority)),
    [tasks.data, member?.id],
  );
  if (!member) return null;
  const projectTitle = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.title ?? id) : null);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={`Assign a task to ${member.name}`} description="Pick an open task to hand over.">
      <Command>
      <CommandInput placeholder={`Assign to ${member.name}…`} />
      <CommandList>
        <CommandEmpty>No open tasks match.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="__new__ create new task"
            onSelect={() => {
              onOpenChange(false);
              openQuickAdd({ owner: member.id });
            }}
          >
            <PlusIcon className="text-foreground" /> New task for {member.name}…
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Open tasks">
          {candidates.map((t) => (
            <CommandItem
              key={t.id}
              value={`${t.title} ${t.id} ${projectTitle(t.project) ?? ""}`}
              onSelect={() => {
                update.mutate({ task: t, args: { owner: member.id } });
                onOpenChange(false);
              }}
            >
              <PriorityFlag priority={t.priority} className="w-3.5" />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <DueChip due={t.due} />
              {projectTitle(t.project) && <span className="max-w-28 truncate text-xs text-muted-foreground">{projectTitle(t.project)}</span>}
              {t.owner ? <MemberAvatar id={t.owner} size="xs" tooltip /> : <span className="text-xs text-muted-foreground">unassigned</span>}
              <span className="sr-only">{members.get(t.owner ?? "")?.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
