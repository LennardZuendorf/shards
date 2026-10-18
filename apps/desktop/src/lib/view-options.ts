/**
 * View options for task lists (R43, R44; tech.md § Planned "View options"): pure group, sort,
 * drop and parse helpers over the loaded active set. No React, no I/O. Every sort is stable and
 * total: ties fall back to manual order, then id, so a list never jitters between refetches.
 */
import { addDays, startOfDay } from "date-fns";
import type { TaskGroupSpec } from "@/components/task/TaskList";
import { compareManual, groupByProject, groupBySection, openBlockers } from "@/components/task/model";
import type { TaskUpdateArgs } from "./api";
import { BUCKET_LABEL, BUCKET_ORDER, dueBucket, dueSortKey, moveDueToDay, type DueBucket } from "./dates";
import { PRIORITY_META, asPriority, priorityRank } from "./priority";
import { PRIORITIES, type Priority, type Task } from "./types";
import { DEFAULT_VIEW_OPTIONS, type GroupBy, type SortBy, type SortDir, type TaskFilters, type ViewId, type ViewOptions } from "./ui-contract";

/* ------------------------------------------------------------- parse */

const GROUPS: readonly GroupBy[] = ["default", "none", "due", "priority", "project", "section", "assignee", "label"];
const SORTS: readonly SortBy[] = ["manual", "due", "priority", "title", "created", "updated"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function parseFilters(raw: unknown): TaskFilters {
  if (!isObj(raw)) return {};
  const out: TaskFilters = {};
  const priority = strings(raw.priority).filter((p): p is Priority => (PRIORITIES as readonly string[]).includes(p));
  if (priority.length) out.priority = priority;
  const due = strings(raw.due).filter((b): b is DueBucket => (BUCKET_ORDER as readonly string[]).includes(b));
  if (due.length) out.due = due;
  const labels = strings(raw.labels);
  if (labels.length) out.labels = labels;
  const assignees = strings(raw.assignees);
  if (assignees.length) out.assignees = assignees;
  if (typeof raw.hasDeadline === "boolean") out.hasDeadline = raw.hasDeadline;
  if (typeof raw.blocked === "boolean") out.blocked = raw.blocked;
  return out;
}

/**
 * Stored options → valid options. Each field is checked on its own against an allowlist, so a
 * bad or older value resets only that field. Section grouping exists only in project views.
 */
export function parseViewOptions(raw: unknown, view: ViewId): ViewOptions {
  if (!isObj(raw)) return DEFAULT_VIEW_OPTIONS;
  const d = DEFAULT_VIEW_OPTIONS;
  let group = GROUPS.includes(raw.group as GroupBy) ? (raw.group as GroupBy) : d.group;
  if (group === "section" && !view.startsWith("project:")) group = d.group;
  return {
    group,
    sort: SORTS.includes(raw.sort as SortBy) ? (raw.sort as SortBy) : d.sort,
    dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : d.dir,
    density: raw.density === "comfortable" || raw.density === "compact" ? raw.density : d.density,
    filters: parseFilters(raw.filters),
  };
}

/* -------------------------------------------------------------- sort */

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Primary sort key; `null` sorts last in both directions. */
function keyOf(t: Task, sort: Exclude<SortBy, "manual">): number | string | null {
  switch (sort) {
    case "due": {
      const k = dueSortKey(t.due);
      return Number.isFinite(k) ? k : null;
    }
    case "priority":
      return priorityRank(t.priority);
    case "title":
      return t.title;
    case "created":
      return t.created || null;
    case "updated":
      return t.updated || null;
  }
}

/**
 * Stable sort by `sort` (`desc` reverses the primary key only). Ties keep manual order, then id.
 * Keys are computed once per task, not once per comparison.
 */
export function sortTasks(tasks: readonly Task[], sort: SortBy, dir: SortDir): Task[] {
  const manual = [...tasks].sort(compareManual);
  if (sort === "manual") return manual;
  const sign = dir === "desc" ? -1 : 1;
  const text = sort === "title";
  const rows = manual.map((t, i) => ({ t, i, k: keyOf(t, sort) }));
  rows.sort((a, b) => {
    if (a.k !== b.k) {
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const c = text ? collator.compare(a.k as string, b.k as string) : a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
      if (c) return sign * c;
    }
    return a.i - b.i;
  });
  return rows.map((r) => r.t);
}

/** A comparator that reproduces `sortTasks(pool, …)` for any task in `pool` (roots of a tree). */
function rankCompare(pool: readonly Task[], sort: SortBy, dir: SortDir): (a: Task, b: Task) => number {
  const rank = new Map(sortTasks(pool, sort, dir).map((t, i) => [t.id, i]));
  const at = (t: Task) => rank.get(t.id) ?? Number.MAX_SAFE_INTEGER;
  return (a, b) => at(a) - at(b) || compareManual(a, b);
}

/* ------------------------------------------------------------ filter */

const hasValues = (v: readonly unknown[] | undefined): v is readonly unknown[] => !!v && v.length > 0;

/** Whether any filter narrows the list (an empty value list does not). */
export function filtersActive(f: TaskFilters): boolean {
  return hasValues(f.priority) || hasValues(f.due) || hasValues(f.labels) || hasValues(f.assignees) || f.hasDeadline !== undefined || f.blocked !== undefined;
}

/**
 * Tasks matching every active filter (AND); several values inside one filter match any (OR).
 * `blocked` is the readiness a row shows: an open blocker, not a bare `blocked_by` entry. A label
 * nobody carries any more still filters (to nothing), so a stored chip stays honest.
 */
export function filterTasks(tasks: readonly Task[], f: TaskFilters, ctx: Pick<GroupContext, "now" | "openIds"> = {}): Task[] {
  if (!filtersActive(f)) return tasks as Task[];
  const bucketOf = f.due?.length ? dueBucketMemo(ctx.now ?? new Date()) : null;
  const openIds = ctx.openIds ?? new Set<string>();
  const priority = f.priority?.length ? new Set<string>(f.priority) : null;
  const due = f.due?.length ? new Set<string>(f.due) : null;
  const labels = f.labels?.length ? new Set(f.labels) : null;
  const assignees = f.assignees?.length ? new Set(f.assignees) : null;
  return tasks.filter(
    (t) =>
      (!priority || priority.has(asPriority(t.priority))) &&
      (!due || (bucketOf !== null && due.has(bucketOf(t.due)))) &&
      (!labels || t.tags.some((l) => labels.has(l))) &&
      (!assignees || assignees.has(t.owner ?? "")) &&
      (f.hasDeadline === undefined || !!t.deadline === f.hasDeadline) &&
      (f.blocked === undefined || openBlockers(t, openIds).length > 0 === f.blocked),
  );
}

export interface FilterChip {
  /** Filter field, stable across renders. */
  key: keyof TaskFilters;
  label: string;
  /** The filters with this one removed. */
  clear: (f: TaskFilters) => TaskFilters;
}

/** One removable chip per active filter, in menu order. */
export function filterChips(f: TaskFilters, memberName: (id: string) => string = (id) => id): FilterChip[] {
  const without = (key: keyof TaskFilters) => (cur: TaskFilters) => {
    const next = { ...cur };
    delete next[key];
    return next;
  };
  const chips: FilterChip[] = [];
  const list = (key: "priority" | "due" | "labels" | "assignees", name: string, show: (v: string) => string) => {
    const v = f[key] as string[] | undefined;
    if (v?.length) chips.push({ key, label: `${name}: ${v.map(show).join(", ")}`, clear: without(key) });
  };
  list("priority", "Priority", (p) => PRIORITY_META[asPriority(p)].label);
  list("due", "Due", (b) => BUCKET_LABEL[b as DueBucket]);
  list("labels", "Label", (l) => l);
  list("assignees", "Assignee", (id) => (id ? memberName(id) : "Unassigned"));
  if (f.hasDeadline !== undefined) chips.push({ key: "hasDeadline", label: f.hasDeadline ? "Has deadline" : "No deadline", clear: without("hasDeadline") });
  if (f.blocked !== undefined) chips.push({ key: "blocked", label: f.blocked ? "Blocked" : "Not blocked", clear: without("blocked") });
  return chips;
}

/* ------------------------------------------------------------- group */

export interface GroupContext {
  now?: Date;
  /** Projects in sidebar order. */
  projects?: readonly { id: string; title: string }[];
  /** Known section names (project views), in order. */
  sections?: readonly string[];
  /** Display name for a member id. */
  memberName?: (id: string) => string;
  /** Ids of every open task, for the derived "blocked" state the rows show. */
  openIds?: ReadonlySet<string>;
}

export interface TaskGroup {
  key: string;
  title: string;
  tasks: Task[];
}

/** `dueBucket` memoised per due string for one pass (date-fns day maths is the hot path). */
export function dueBucketMemo(now: Date): (due: string | null | undefined) => DueBucket {
  const memo = new Map<string, DueBucket>();
  return (due) => {
    if (!due) return "none";
    let b = memo.get(due);
    if (b === undefined) {
      b = dueBucket(due, now);
      memo.set(due, b);
    }
    return b;
  };
}

const byTitle = (a: TaskGroup, b: TaskGroup) => collator.compare(a.title, b.title) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Bucket a list by one key per task, keeping input order inside each bucket. */
function bucket(tasks: readonly Task[], keyOfTask: (t: Task) => string): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = keyOfTask(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  return map;
}

/**
 * Groups for a grouping other than `default`. Priority lists every priority and due lists every
 * bucket a drop can date (empty ones are drop targets only); the other groupings list what is
 * there. A task carrying several labels is in each of its label groups.
 */
export function groupTasks(tasks: readonly Task[], group: Exclude<GroupBy, "default">, ctx: GroupContext): TaskGroup[] {
  switch (group) {
    case "none":
      return [{ key: "all", title: "", tasks: [...tasks] }];
    case "due": {
      const bucketOf = dueBucketMemo(ctx.now ?? new Date());
      const map = bucket(tasks, (t) => bucketOf(t.due));
      return BUCKET_ORDER.filter((b) => map.has(b) || DUE_TARGETS.includes(b)).map((b) => ({ key: b, title: BUCKET_LABEL[b], tasks: map.get(b) ?? [] }));
    }
    case "priority": {
      const map = bucket(tasks, (t) => asPriority(t.priority));
      return PRIORITIES.map((p) => ({ key: p, title: PRIORITY_META[p].label, tasks: map.get(p) ?? [] }));
    }
    case "project": {
      const list = ctx.projects ?? [];
      const title = (id: string | null) => (id ? (list.find((p) => p.id === id)?.title ?? id) : "Inbox");
      return groupByProject(
        tasks,
        list.map((p) => p.id),
      ).map((g) => ({ key: g.project ?? "", title: title(g.project), tasks: g.tasks }));
    }
    case "section":
      return groupBySection([...tasks], [...(ctx.sections ?? [])]).map((g) => ({ key: g.section, title: g.section || "No section", tasks: g.tasks }));
    case "assignee": {
      const name = ctx.memberName ?? ((id: string) => id);
      const map = bucket(tasks, (t) => t.owner ?? "");
      const named = [...map.keys()].filter(Boolean).map((k) => ({ key: k, title: name(k), tasks: map.get(k) ?? [] }));
      named.sort(byTitle);
      return map.has("") ? [...named, { key: "", title: "Unassigned", tasks: map.get("") ?? [] }] : named;
    }
    case "label": {
      const map = new Map<string, Task[]>();
      for (const t of tasks) {
        const tags = t.tags.length ? [...new Set(t.tags)] : [""];
        for (const k of tags) {
          const list = map.get(k);
          if (list) list.push(t);
          else map.set(k, [t]);
        }
      }
      const named = [...map.keys()].filter(Boolean).map((k) => ({ key: k, title: `@${k}`, tasks: map.get(k) ?? [] }));
      named.sort(byTitle);
      return map.has("") ? [...named, { key: "", title: "No label", tasks: map.get("") ?? [] }] : named;
    }
  }
}

/* -------------------------------------------------------------- drop */

/** Buckets a drop can give a date to (overdue and later are refused). */
const DUE_TARGETS: readonly DueBucket[] = ["today", "tomorrow", "week", "none"];

/**
 * "Next 7 days": next Monday, unless that falls outside the bucket (on Sunday it is tomorrow,
 * on Monday a week away); then the day after tomorrow.
 */
function weekTarget(today: Date): Date {
  const toMonday = (8 - today.getDay()) % 7 || 7;
  return addDays(today, toMonday >= 2 && toMonday <= 6 ? toMonday : 2);
}

/**
 * The update a drop into group `key` of grouping `group` writes, or `null` to refuse it.
 * Label groups refuse: a task may carry several labels. Assignee "" refuses: the core cannot
 * clear an owner. A due drop keeps the task's time of day.
 */
export function dropPatch(group: GroupBy, key: string, opts: { task?: Task; now?: Date } = {}): TaskUpdateArgs | null {
  switch (group) {
    case "priority":
      return (PRIORITIES as readonly string[]).includes(key) ? { priority: key as Priority } : null;
    case "project":
      return { project: key, section: null };
    case "section":
      return { section: key || null };
    case "assignee":
      return key ? { owner: key } : null;
    case "due": {
      const today = startOfDay(opts.now ?? new Date());
      const day = key === "today" ? today : key === "tomorrow" ? addDays(today, 1) : key === "week" ? weekTarget(today) : null;
      if (key === "none") return { due: null };
      return day ? { due: moveDueToDay(opts.task?.due, day) } : null;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------- apply */

/** Label grouping repeats a task in several groups, so its list renders without drag & drop. */
export const isStaticGrouping = (o: ViewOptions) => o.group === "label";

/**
 * Apply view options to a view's delivered groups. `default` + `manual` returns `defaults`
 * itself (filters off). Another sort keeps the groups and orders inside them, with reorder off. Another
 * grouping regroups every task except the `fixed` tail groups (delegated, completed), which
 * stay as delivered at the end.
 */
export function applyViewOptions(delivered: TaskGroupSpec[], o: ViewOptions, ctx: GroupContext): TaskGroupSpec[] {
  const sorted = o.sort !== "manual";
  // Filters narrow every delivered group first (the fixed tail too), then grouping and sort run.
  const defaults = filtersActive(o.filters) ? delivered.map((s) => ({ ...s, tasks: filterTasks(s.tasks, o.filters, ctx) })) : delivered;
  if (o.group === "default" && !sorted) return defaults;
  const fixed = defaults.filter((s) => s.fixed);
  const live = defaults.filter((s) => !s.fixed);
  const seen = new Set<string>();
  const pool: Task[] = [];
  for (const s of live) {
    for (const t of s.tasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      pool.push(t);
    }
  }
  const compare = sorted ? rankCompare(pool, o.sort, o.dir) : null;

  if (o.group === "default") return [...live.map((s) => ({ ...s, compare: compare ?? s.compare, reorder: false })), ...fixed];

  const group = o.group;
  const base = live.find((s) => s.compare)?.compare ?? compareManual;
  const reorder = !sorted && group !== "label" && live.some((s) => s.reorder);
  const specs: TaskGroupSpec[] = groupTasks(pool, group, ctx).map((g) => ({
    key: `${group}:${g.key}`,
    title: g.title || undefined,
    label: g.title || undefined,
    tasks: g.tasks,
    compare: compare ?? base,
    reorder,
    dropArgs: (t: Task) => dropPatch(group, g.key, { task: t, now: ctx.now }),
    dropZoneOnly: g.tasks.length === 0,
  }));
  return [...specs, ...fixed];
}
