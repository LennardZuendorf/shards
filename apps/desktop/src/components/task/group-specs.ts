/**
 * Each task view's delivered grouping (its default `TaskGroupSpec[]`), as pure builders. The
 * views add titles that need JSX and header actions on top; view options (`lib/view-options`)
 * transform these specs, and `group: "default"` returns them unchanged.
 */
import { addDays, addWeeks, differenceInCalendarDays, format, startOfDay, startOfWeek } from "date-fns";
import { dayHeader, dueBucket, moveDueToDay, parseDue, toDateKey } from "@/lib/dates";
import { isMine, splitMine, type TaskScope } from "@/lib/scope";
import type { Task } from "@/lib/types";
import { compareByDue, compareManual, groupByProject, groupBySection } from "./model";
import type { TaskGroupSpec } from "./TaskList";

const active = (t: Task) => t.status === "open" || t.status === "claimed";

/* ------------------------------------------------------------- Today */

export interface TodaySets {
  overdue: Task[];
  today: Task[];
  /** Delegated work the Mine scope moves into the collapsed bottom group. */
  others: Task[];
}

/** Open tasks overdue or due today; Mine keeps the acting human's plan and sets the rest aside. */
export function todaySets(all: readonly Task[], now: Date, scope: TaskScope, me: string | null): TodaySets {
  const o: Task[] = [];
  const t: Task[] = [];
  for (const x of all) {
    if (!active(x)) continue;
    const b = dueBucket(x.due, now);
    if (b === "overdue") o.push(x);
    else if (b === "today") t.push(x);
  }
  if (scope === "everyone") return { overdue: o, today: t, others: [] };
  const so = splitMine(o, me);
  const st = splitMine(t, me);
  return { overdue: so.mine, today: st.mine, others: [...so.others, ...st.others] };
}

/** Overdue (refuses drops), then Today (a drop moves the due date to today). */
export function todayGroups({ overdue, today }: TodaySets, now: Date): TaskGroupSpec[] {
  const groups: TaskGroupSpec[] = [];
  if (overdue.length) {
    groups.push({ key: "overdue", title: "Overdue", tone: "danger", tasks: overdue, compare: compareByDue, dropArgs: () => null });
  }
  groups.push({
    key: "today",
    title: overdue.length ? `${format(now, "d MMM")} · Today · ${format(now, "EEEE")}` : undefined,
    tasks: today,
    compare: compareByDue,
    collapsible: false,
    addDefaults: { due: toDateKey(now) },
    dropArgs: (t) => ({ due: moveDueToDay(t.due, startOfDay(new Date())) }),
  });
  return groups;
}

/* ---------------------------------------------------------- Upcoming */

const MIN_DAYS = 14;

export interface UpcomingDay {
  date: Date;
  key: string;
}

/** The days Upcoming lists: from today through the end of the strip's week, at least 14. */
export function upcomingRange(todayKey: string, week: number): UpcomingDay[] {
  const today = startOfDay(new Date(`${todayKey}T00:00`));
  const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), week);
  const lastStrip = addDays(weekStart, 6);
  const span = Math.max(MIN_DAYS, differenceInCalendarDays(lastStrip, today) + 1);
  return Array.from({ length: span }, (_, i) => {
    const date = addDays(today, i);
    return { date, key: toDateKey(date) };
  });
}

/** Overdue, one group per day (empty days included), then Later; Mine sets delegated work aside. */
export function upcomingGroups(
  all: readonly Task[],
  days: readonly UpcomingDay[],
  scope: TaskScope,
  me: string | null,
): { groups: TaskGroupSpec[]; byDay: Map<string, Task[]>; others: Task[] } {
  const overdue: Task[] = [];
  const byDay = new Map<string, Task[]>();
  const later: Task[] = [];
  const others: Task[] = [];
  const start = days[0]?.date;
  const end = days[days.length - 1]?.date;
  for (const t of all) {
    if (!active(t)) continue;
    const p = parseDue(t.due);
    if (!p || !start || !end) continue;
    if (scope === "mine" && !isMine(t, me)) {
      others.push(t);
      continue;
    }
    const diff = differenceInCalendarDays(p.date, start);
    if (diff < 0) overdue.push(t);
    else if (p.date <= addDays(end, 1) && differenceInCalendarDays(p.date, end) <= 0) {
      const k = toDateKey(p.date);
      byDay.set(k, [...(byDay.get(k) ?? []), t]);
    } else later.push(t);
  }
  const groups: TaskGroupSpec[] = [];
  if (overdue.length) groups.push({ key: "overdue", title: "Overdue", tone: "danger", tasks: overdue, compare: compareByDue, dropArgs: () => null });
  for (const d of days) {
    const tasks = byDay.get(d.key) ?? [];
    groups.push({
      key: `day:${d.key}`,
      title: dayHeader(d.date),
      label: dayHeader(d.date),
      tasks,
      compare: compareByDue,
      collapsible: false,
      dim: tasks.length === 0,
      addDefaults: { due: d.key },
      dropArgs: (t) => ({ due: moveDueToDay(t.due, d.date) }),
    });
  }
  if (later.length) groups.push({ key: "later", title: "Later", tasks: later, compare: compareByDue, dropArgs: () => null });
  return { groups, byDay, others };
}

/* ------------------------------------------------------------- Label */

/** One group per project (Inbox first, then sidebar order); dropping on a header moves the task. */
export function labelGroups(
  tasks: readonly Task[],
  projectOrder: readonly string[],
  projectTitle: (id: string | null) => string,
  label: string,
): TaskGroupSpec[] {
  return groupByProject(tasks, projectOrder).map((g) => ({
    key: `p:${g.project ?? ""}`,
    title: projectTitle(g.project),
    collapsible: false,
    tasks: g.tasks,
    compare: compareByDue,
    addDefaults: { labels: [label], project: g.project },
    dropArgs: () => ({ project: g.project ?? "", section: null }),
  }));
}

/* ------------------------------------------------- Project and Inbox */

/**
 * The unsectioned head, one group per section (known ones even when empty), manual order with
 * reorder on, and the completed tail (fixed) when given.
 */
export function sectionGroups(tasks: Task[], sections: string[], project: string | null, completed: Task[] | null | undefined): TaskGroupSpec[] {
  const specs: TaskGroupSpec[] = groupBySection(tasks, sections).map((g) => ({
    key: `s:${g.section}`,
    label: g.section || undefined,
    title: g.section || undefined,
    collapsible: !!g.section,
    tasks: g.tasks,
    reorder: true,
    compare: compareManual,
    addDefaults: { project, section: g.section || null },
    dropArgs: () => ({ section: g.section || null }),
  }));
  if (completed?.length) {
    specs.push({
      key: "completed",
      title: "Completed",
      dim: true,
      tasks: completed,
      compare: (a, b) => (b.completed ?? b.updated ?? "").localeCompare(a.completed ?? a.updated ?? ""),
      dropArgs: () => null,
      fixed: true,
    });
  }
  return specs;
}
