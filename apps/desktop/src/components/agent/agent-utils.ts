/**
 * Delegation board derivation (D4). Pure: members + tasks + activity + memory/scratch
 * footprints in, one card per identity plus the summary row out.
 */
import { guessMemberKind } from "@/lib/api/host";
import { priorityRank } from "@/lib/priority";
import { ERROR_LABELS, NEEDS_INPUT_LABELS } from "@/lib/status";
import type { ActivityRow, Member, Memory, Scratch, Task } from "@/lib/types";

export type BoardState = "working" | "awaiting" | "error" | "idle";

export interface IdentityCard {
  member: Member;
  state: BoardState;
  /** Tasks this identity is executing now (`claimed_by`). */
  claimed: Task[];
  /** Owned open tasks not claimed by anyone, ready first then priority. */
  queue: Task[];
  /** Owned/claimed open tasks waiting on a human (needs-input label or a human blocker). */
  awaiting: Task[];
  /** Owned/claimed open tasks carrying an error label. */
  errored: Task[];
  activity: ActivityRow[];
  memories: number;
  scratch: number;
  doneToday: number;
  /** Epoch ms of the newest sign of life (activity, scratch, memory), or null. */
  lastSeen: number | null;
}

export interface BoardSummary {
  agentsWorking: number;
  inProgress: number;
  awaitingYou: number;
  doneToday: number;
}

export interface BoardInput {
  members: Member[];
  me: string | null;
  open: Task[];
  done: Task[];
  readyIds?: Set<string>;
  activity?: ActivityRow[];
  memories?: Memory[];
  scratch?: Scratch[];
  now?: Date;
}

const isOpen = (t: Task) => t.status === "open" || t.status === "claimed";

/** Union of configured members and every identity seen in the vault (scratch agents are agents). */
export function collectMembers(input: Pick<BoardInput, "members" | "me" | "open" | "done" | "memories" | "scratch">): Member[] {
  const map = new Map<string, Member>();
  for (const m of input.members) map.set(m.id, m);
  const add = (id: string | null | undefined, kind?: Member["kind"]) => {
    if (!id || map.has(id)) return;
    map.set(id, { id, kind: kind ?? guessMemberKind(id, input.me), name: id });
  };
  if (input.me) add(input.me, "human");
  for (const s of input.scratch ?? []) add(s.agent, "agent");
  for (const t of [...input.open, ...input.done]) {
    add(t.owner);
    add(t.claimed_by);
  }
  for (const m of input.memories ?? []) add(m.owner);
  return [...map.values()];
}

/** Completed today (local day), from `completed` (v2) or `updated` (v1 core). */
export function isDoneToday(t: Task, now: Date = new Date()): boolean {
  if (t.status !== "done") return false;
  const ts = t.completed ?? t.updated;
  if (!ts) return false;
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Waiting on a human: a needs-input label, or an open blocker owned/claimed by a human.
 * A blocker held by the agent itself (or another agent) is not "awaiting your input".
 */
export function isAwaitingHuman(t: Task, byId: Map<string, Task>, kindOf: (id: string) => Member["kind"]): boolean {
  if (!isOpen(t)) return false;
  if (t.tags.some((x) => NEEDS_INPUT_LABELS.includes(x))) return true;
  return t.blocked_by.some((b) => {
    const blocker = byId.get(b);
    if (!blocker || !isOpen(blocker)) return false;
    const holder = blocker.claimed_by ?? blocker.owner;
    return !!holder && kindOf(holder) === "human";
  });
}

export const isErrored = (t: Task) => isOpen(t) && t.tags.some((x) => ERROR_LABELS.includes(x));

/** Queue order: ready first, then priority, then oldest. */
export function sortQueue(tasks: Task[], readyIds?: Set<string>): Task[] {
  const ready = (t: Task) => (readyIds ? (readyIds.has(t.id) ? 0 : 1) : t.blocked_by.length ? 1 : 0);
  return [...tasks].sort(
    (a, b) => ready(a) - ready(b) || priorityRank(a.priority) - priorityRank(b.priority) || (a.created ?? "").localeCompare(b.created ?? ""),
  );
}

function stateFor(c: Pick<IdentityCard, "claimed" | "awaiting" | "errored">): BoardState {
  if (c.errored.length) return "error";
  if (c.awaiting.length) return "awaiting";
  if (c.claimed.length) return "working";
  return "idle";
}

export function buildBoard(input: BoardInput): { agents: IdentityCard[]; humans: IdentityCard[]; summary: BoardSummary } {
  const now = input.now ?? new Date();
  const members = collectMembers(input);
  const kind = new Map(members.map((m) => [m.id, m.kind]));
  const kindOf = (id: string) => kind.get(id) ?? guessMemberKind(id, input.me);
  const byId = new Map(input.open.map((t) => [t.id, t]));

  const cards = members.map((member): IdentityCard => {
    const id = member.id;
    const mine = input.open.filter((t) => t.owner === id || t.claimed_by === id);
    const claimed = input.open.filter((t) => t.claimed_by === id && t.status === "claimed");
    const queue = sortQueue(
      input.open.filter((t) => t.owner === id && t.status === "open" && !t.claimed_by),
      input.readyIds,
    );
    const awaiting = mine.filter((t) => isAwaitingHuman(t, byId, kindOf));
    const errored = mine.filter(isErrored);
    const activity = (input.activity ?? []).filter((a) => a.owner === id || a.claimed_by === id);
    const scratch = (input.scratch ?? []).filter((s) => s.agent === id);
    const memories = (input.memories ?? []).filter((m) => m.owner === id);
    // A sign of life is something the identity itself did. A change to a task it merely owns
    // may be someone else's edit (no writer is stored yet), so only a task it holds counts.
    const stamps = [
      ...activity.filter((a) => a.claimed_by === id).map((a) => a.mtime * 1000),
      ...scratch.map((s) => (s.updated ? Date.parse(s.updated) : NaN)),
      ...memories.map((m) => (m.updated ? Date.parse(m.updated) : NaN)),
    ].filter((n) => Number.isFinite(n));
    const card = {
      member,
      claimed,
      queue,
      awaiting,
      errored,
      activity,
      memories: memories.length,
      scratch: scratch.length,
      doneToday: input.done.filter((t) => (t.owner === id || t.claimed_by === id) && isDoneToday(t, now)).length,
      lastSeen: stamps.length ? Math.max(...stamps) : null,
    };
    return { ...card, state: stateFor(card) };
  });

  const rank: Record<BoardState, number> = { error: 0, awaiting: 1, working: 2, idle: 3 };
  const order = (a: IdentityCard, b: IdentityCard) =>
    rank[a.state] - rank[b.state] || (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.member.name.localeCompare(b.member.name, "en");
  const agents = cards.filter((c) => c.member.kind === "agent").sort(order);
  const humans = cards
    .filter((c) => c.member.kind === "human")
    .sort((a, b) => (a.member.id === input.me ? -1 : b.member.id === input.me ? 1 : order(a, b)));

  const awaitingIds = new Set<string>();
  for (const c of agents) for (const t of c.awaiting) awaitingIds.add(t.id);
  return {
    agents,
    humans,
    summary: {
      agentsWorking: agents.filter((c) => c.claimed.length > 0).length,
      inProgress: input.open.filter((t) => t.status === "claimed").length,
      awaitingYou: awaitingIds.size,
      doneToday: input.done.filter((t) => isDoneToday(t, now)).length,
    },
  };
}
