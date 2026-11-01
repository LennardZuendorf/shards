import type { IdentityCard } from "./agent-utils";

export interface NeedsYouItem {
  member: IdentityCard["member"];
  task: IdentityCard["awaiting"][number];
}

/** Actionable waiting tasks in the same priority order as the board's agent identities. */
export function getNeedsYouItems(board: { agents: IdentityCard[] }): NeedsYouItem[] {
  return board.agents.flatMap((card) => card.awaiting.map((task) => ({ member: card.member, task })));
}
