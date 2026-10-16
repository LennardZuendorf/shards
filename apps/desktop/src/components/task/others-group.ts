import { useMemberMap } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { compareByDue } from "./model";
import type { TaskGroupSpec } from "./TaskList";

/** The collapsed bottom group holding work the Mine scope hides ("Agents · N"). */
export function useOthersGroup(others: Task[]): TaskGroupSpec | null {
  const members = useMemberMap();
  if (!others.length) return null;
  const allAgents = others.every((t) => {
    const who = t.claimed_by ?? t.owner;
    return !!who && members.get(who)?.kind === "agent";
  });
  return {
    key: "others",
    title: allAgents ? "Agents" : "Agents & others",
    label: "Delegated to agents and others",
    tasks: others,
    compare: compareByDue,
    defaultCollapsed: true,
    dropArgs: () => null,
  };
}
