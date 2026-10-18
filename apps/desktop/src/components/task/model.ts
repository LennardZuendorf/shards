/**
 * Pure task-list helpers: manual ordering (midpoints), section grouping, subtask trees, board
 * columns, the description/comments body split and search highlighting. No React, no I/O.
 */
import type { Task, TaskStatus } from "@/lib/types";
import { priorityRank } from "@/lib/priority";
import { dueSortKey } from "@/lib/dates";

/* ------------------------------------------------------------- ordering */

/** Step used when (re)numbering a group. Large so later midpoints have room. */
export const ORDER_STEP = 1024;
/** Below this gap a midpoint is considered exhausted and the group is renumbered. */
export const MIN_GAP = 1e-6;

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Manual order: `order` ascending (unset last), then `created` ascending, then id — stable and
 * deterministic so the list never jitters between refetches.
 */
export function compareManual(a: Task, b: Task): number {
  const oa = num(a.order);
  const ob = num(b.order);
  if (oa !== null && ob !== null && oa !== ob) return oa - ob;
  if (oa !== null && ob === null) return -1;
  if (oa === null && ob !== null) return 1;
  const ca = a.created ?? "";
  const cb = b.created ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Date-driven views (Today, Upcoming, Label, Search): due, then priority, then manual. */
export function compareByDue(a: Task, b: Task): number {
  const da = dueSortKey(a.due);
  const db = dueSortKey(b.due);
  if (da !== db) return da - db;
  const pa = priorityRank(a.priority);
  const pb = priorityRank(b.priority);
  if (pa !== pb) return pa - pb;
  return compareManual(a, b);
}

export const sortManual = (tasks: Task[]) => [...tasks].sort(compareManual);

/**
 * The order value between two neighbours, or `null` when there is no usable gap (both sides
 * set and closer than {@link MIN_GAP}). Missing neighbours extend by one step.
 */
export function orderBetween(prev: number | null | undefined, next: number | null | undefined): number | null {
  const p = num(prev);
  const n = num(next);
  if (p === null && n === null) return ORDER_STEP;
  if (p === null) return (n as number) - ORDER_STEP;
  if (n === null) return p + ORDER_STEP;
  if (n - p <= MIN_GAP) return null;
  return p + (n - p) / 2;
}

export interface OrderWrite {
  id: string;
  order: number;
}

/**
 * Writes needed to place `movedId` at `toIndex` of `ids` (the target group's ids in their current
 * display order, *without* the moved item if it came from another group).
 *
 * - One write (a midpoint) when both neighbours already carry a usable order.
 * - Otherwise the whole group is renumbered 1024, 2048, … in the new order (only rows whose
 *   value actually changes are written).
 */
export function planReorder(
  group: { id: string; order?: number | null }[],
  movedId: string,
  toIndex: number,
): OrderWrite[] {
  const rest = group.filter((g) => g.id !== movedId);
  const idx = Math.max(0, Math.min(toIndex, rest.length));
  const prev = rest[idx - 1];
  const next = rest[idx];
  const neighboursOrdered = (!prev || num(prev.order) !== null) && (!next || num(next.order) !== null);
  // Every item before must be ordered too, or the unordered ones would sort after the moved one.
  const allOrdered = rest.every((g) => num(g.order) !== null);
  if (neighboursOrdered && allOrdered) {
    const mid = orderBetween(prev?.order, next?.order);
    if (mid !== null) return [{ id: movedId, order: mid }];
  }
  const final = [...rest.slice(0, idx), { id: movedId, order: null as number | null }, ...rest.slice(idx)];
  const out: OrderWrite[] = [];
  final.forEach((g, i) => {
    const want = (i + 1) * ORDER_STEP;
    if (g.id === movedId || num(g.order) !== want) out.push({ id: g.id, order: want });
  });
  return out;
}

/* ------------------------------------------------- keyboard structure edits */

/** ⌘⇧↑/↓: the order writes that move `id` one place among `siblings` (shown order), or null at an end. */
export function planMove(siblings: readonly Task[], id: string, delta: -1 | 1): OrderWrite[] | null {
  const i = siblings.findIndex((t) => t.id === id);
  const to = i + delta;
  if (i < 0 || to < 0 || to >= siblings.length) return null;
  return planReorder(
    siblings.map((t) => ({ id: t.id, order: t.order })),
    id,
    to,
  );
}

/** Tab: make `id` the last subtask of its previous sibling. Null for the first sibling. */
export function planIndent(siblings: readonly Task[], id: string, childrenOf: (id: string) => readonly Task[]): { parent: string; order: number } | null {
  const i = siblings.findIndex((t) => t.id === id);
  if (i <= 0) return null;
  const parent = siblings[i - 1];
  let last: number | null = null;
  for (const c of childrenOf(parent.id)) {
    const o = num(c.order);
    if (o !== null && (last === null || o > last)) last = o;
  }
  return { parent: parent.id, order: (last ?? 0) + ORDER_STEP };
}

/**
 * Shift+Tab: lift `task` out of `parent`, right after the parent among the parent's siblings
 * (`parentSiblings`, shown order). A task whose parent is not shown just drops the link.
 */
export function planOutdent(parent: Task | null, parentSiblings: readonly Task[] | null): { order: number | null } {
  if (!parent || !parentSiblings) return { order: null };
  const i = parentSiblings.findIndex((t) => t.id === parent.id);
  const next = i >= 0 ? parentSiblings[i + 1] : undefined;
  return { order: orderBetween(parent.order, next?.order) ?? num(parent.order) };
}

/** Array move (dnd-kit `arrayMove` without the dependency in tests). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/* --------------------------------------------------------------- trees */

export interface TaskNode {
  task: Task;
  children: TaskNode[];
  /** Parent id when the parent is not part of this list (render a breadcrumb). */
  orphanOf: string | null;
}

/**
 * Nest subtasks under parents present in `tasks` (any depth; UI shows one level of indent per
 * depth). Children are sorted manually; roots keep `compare` order.
 */
export function buildTree(tasks: Task[], compare: (a: Task, b: Task) => number = compareManual): TaskNode[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const kids = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    const p = t.parent && t.parent !== t.id && byId.has(t.parent) ? t.parent : null;
    if (p) {
      const list = kids.get(p) ?? [];
      list.push(t);
      kids.set(p, list);
    } else roots.push(t);
  }
  const seen = new Set<string>();
  const node = (t: Task): TaskNode => {
    seen.add(t.id);
    const children = (kids.get(t.id) ?? []).filter((c) => !seen.has(c.id)).sort(compareManual).map(node);
    return { task: t, children, orphanOf: t.parent && !byId.has(t.parent) ? t.parent : null };
  };
  return [...roots].sort(compare).map(node);
}

/** Depth-first flatten, skipping children of collapsed nodes. */
export function flattenTree(nodes: TaskNode[], collapsed: ReadonlySet<string> = new Set()): { task: Task; depth: number }[] {
  const out: { task: Task; depth: number }[] = [];
  const walk = (ns: TaskNode[], depth: number) => {
    for (const n of ns) {
      out.push({ task: n.task, depth });
      if (n.children.length && !collapsed.has(n.task.id)) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

/** The one counting rule (top-level tasks only) lives in lib/scope so badges share it. */
export { countTopLevel } from "@/lib/scope";

/**
 * Every open (or claimed) descendant of `id` in `tasks`, parents before children. Guarded
 * against a `parent` cycle in hand-edited files.
 */
export function openDescendants(tasks: readonly Task[], id: string): Task[] {
  const byParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parent || (t.status !== "open" && t.status !== "claimed")) continue;
    const list = byParent.get(t.parent);
    if (list) list.push(t);
    else byParent.set(t.parent, [t]);
  }
  const out: Task[] = [];
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    for (const c of byParent.get(queue.shift() as string) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      queue.push(c.id);
    }
  }
  return out;
}

/** Count of all descendants (subtask badge). */
export function descendantCount(n: TaskNode): number {
  return n.children.reduce((s, c) => s + 1 + descendantCount(c), 0);
}

/* ------------------------------------------------------------ sections */

export interface SectionGroup {
  /** `""` = no section. */
  section: string;
  tasks: Task[];
}

/**
 * Group by `section`. Order: the unsectioned group first (always present), then `known`
 * sections in their given order (present even when empty), then any other section in the manual
 * order of its first task. Subtasks travel with their parent's section when the parent is in
 * the list, so a tree never splits across groups.
 */
export function groupBySection(tasks: Task[], known: string[] = []): SectionGroup[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sectionOf = (t: Task): string => {
    let cur = t;
    const guard = new Set<string>();
    while (cur.parent && byId.has(cur.parent) && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = byId.get(cur.parent) as Task;
    }
    return cur.section ?? "";
  };
  const names: string[] = [""];
  for (const k of known) if (k && !names.includes(k)) names.push(k);
  for (const t of sortManual(tasks)) {
    const s = sectionOf(t);
    if (!names.includes(s)) names.push(s);
  }
  const map = new Map<string, Task[]>(names.map((n) => [n, []]));
  for (const t of tasks) map.get(sectionOf(t))?.push(t);
  return names.map((section) => ({ section, tasks: map.get(section) ?? [] }));
}

/* --------------------------------------------------------------- board */

export type BoardStatus = "open" | "progress" | "blocked" | "done" | "cancelled";
export const BOARD_STATUSES: readonly BoardStatus[] = ["open", "progress", "blocked", "done", "cancelled"];
export const BOARD_STATUS_LABEL: Record<BoardStatus, string> = {
  open: "To do",
  progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

/** Unsatisfied blockers: `blocked_by` ids that are still in the open/claimed set. */
export function openBlockers(t: Task, openIds: ReadonlySet<string>): string[] {
  return (t.blocked_by ?? []).filter((id) => openIds.has(id));
}

export const isDoneStatus = (s: TaskStatus | string) => s === "done" || s === "cancelled";

/** Column precedence: cancelled, done > blocked > in progress > open. */
export function boardStatusOf(t: Task, openIds: ReadonlySet<string>): BoardStatus {
  if (t.status === "cancelled") return "cancelled";
  if (isDoneStatus(t.status)) return "done";
  if (openBlockers(t, openIds).length) return "blocked";
  if (t.status === "claimed") return "progress";
  return "open";
}

/**
 * Whether a board column is collapsed. `toggled` holds the columns the viewer flipped away from
 * their default, so Cancelled starts collapsed on the status board and the viewer's choice sticks.
 */
export function columnCollapsed(toggled: ReadonlySet<string>, mode: "section" | "status", key: string): boolean {
  const byDefault = mode === "status" && key === "cancelled";
  return toggled.has(key) !== byDefault;
}

/** What dropping a card on a status column does (`null` = nothing to write). */
export type StatusDrop =
  | "complete"
  | "cancel"
  | "claim"
  | "release"
  | "reopen"
  | "reopen-claim"
  | "reopen-complete"
  | "reopen-cancel"
  | "refuse-blocked";

/**
 * The status-board drop rules. A terminal task is reopened before it moves to the other terminal
 * state, because the core treats finish/cancel on a terminal task as a no-op.
 */
export function statusDrop(t: Task, to: BoardStatus): StatusDrop | null {
  const terminal = isDoneStatus(t.status);
  switch (to) {
    case "blocked":
      return "refuse-blocked";
    case "done":
      if (t.status === "done") return null;
      return t.status === "cancelled" ? "reopen-complete" : "complete";
    case "cancelled":
      if (t.status === "cancelled") return null;
      return t.status === "done" ? "reopen-cancel" : "cancel";
    case "progress":
      if (t.status === "claimed") return null;
      return terminal ? "reopen-claim" : "claim";
    case "open":
      if (t.status === "claimed") return "release";
      return terminal ? "reopen" : null;
  }
}

/* -------------------------------------------------------------- projects */

export interface ProjectGroup {
  /** `null` = Inbox. */
  project: string | null;
  tasks: Task[];
}

/**
 * Group by project for the Label view: Inbox first, then projects in `order` (the sidebar's),
 * then any other project id by name. Groups without tasks are left out; tasks keep input order.
 */
export function groupByProject(tasks: readonly Task[], order: readonly string[]): ProjectGroup[] {
  const map = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.project || null;
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  const rank = new Map(order.map((id, i) => [id, i]));
  const keys = [...map.keys()].sort((a, b) => {
    if (a === null || b === null) return a === null ? (b === null ? 0 : -1) : 1;
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined || rb !== undefined) return ra === undefined ? 1 : rb === undefined ? -1 : ra - rb;
    return a.localeCompare(b, "en");
  });
  return keys.map((project) => ({ project, tasks: map.get(project) ?? [] }));
}

/* ------------------------------------------------- body + comments split */

const COMMENTS_RE = /^##[ \t]+Comments[ \t]*$/m;

/** Split a task body into the editable description and everything from `## Comments` on. */
export function splitBody(body: string | null | undefined): { description: string; rest: string } {
  const b = body ?? "";
  const m = COMMENTS_RE.exec(b);
  if (!m) return { description: b.replace(/\s+$/, ""), rest: "" };
  return { description: b.slice(0, m.index).replace(/\s+$/, ""), rest: b.slice(m.index) };
}

/** Join an edited description with the preserved tail (byte-for-byte). */
export function joinBody(description: string, rest: string): string {
  const d = description.replace(/\s+$/, "");
  if (!rest) return d ? `${d}\n` : "";
  return d ? `${d}\n\n${rest}` : rest;
}

export interface Comment {
  /** RFC 3339 `…Z`. */
  at: string;
  actor: string | null;
  text: string;
}

const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)(?:[ \t]+—[ \t]+(.+?))?[ \t]*$/;

/**
 * Comments under `## Comments`: blocks headed by the core's append stamp
 * (`2026-10-15T19:13:58Z — lennard`). Text before the first stamp becomes an anonymous comment;
 * a following `## …` heading ends the section.
 */
export function parseComments(rest: string): Comment[] {
  if (!rest) return [];
  const lines = rest.split("\n");
  let i = COMMENTS_RE.test(lines[0] ?? "") ? 1 : 0;
  const out: Comment[] = [];
  let cur: { at: string; actor: string | null; lines: string[] } | null = null;
  const push = () => {
    if (!cur) return;
    const text = cur.lines.join("\n").trim();
    if (text || cur.at) out.push({ at: cur.at, actor: cur.actor, text });
    cur = null;
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^##[ \t]+\S/.test(line)) break;
    const m = STAMP_RE.exec(line);
    if (m) {
      push();
      cur = { at: m[1], actor: m[2] ?? null, lines: [] };
    } else {
      if (!cur) {
        if (!line.trim()) continue;
        cur = { at: "", actor: null, lines: [] };
      }
      cur.lines.push(line);
    }
  }
  push();
  return out;
}

/** First non-empty, non-heading line of a description, stripped of Markdown markers. */
export function descriptionPreview(body: string | null | undefined, max = 140): string {
  const { description } = splitBody(body);
  for (const raw of description.split("\n")) {
    const l = raw.trim();
    if (!l || /^#{1,6}\s/.test(l) || /^(-{3,}|\*{3,})$/.test(l)) continue;
    const s = l
      .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a)
      .replace(/[*_`~]+/g, "");
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  return "";
}

/* ------------------------------------------------------------- search */

/** Split `text` into plain/highlighted parts for every whitespace-separated query term. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 0))];
  if (!terms.length || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(term, from);
      if (i < 0) break;
      for (let k = i; k < i + term.length; k++) marks[k] = true;
      from = i + term.length;
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      out.push({ text: text.slice(start, i), hit: marks[start] });
      start = i;
    }
  }
  return out;
}

/** Client-side filter: every query term must appear in title, labels, id or section. */
export function matchesQuery(t: Task, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [t.title, t.id, t.section ?? "", ...t.tags].join(" ").toLowerCase();
  return terms.every((x) => hay.includes(x));
}
