/**
 * In-window reminders for timed tasks (R40, desktop-app/30).
 *
 * The scheduler is pure: it takes the loaded task set and one timestamp, and returns the notices
 * this tick should raise. `app/Reminders.tsx` runs it on the shared minute clock (`lib/now.ts`)
 * and hands each result to the toast surface — no second interval, no host tick, no OS
 * notification permission (that is app-polish AP1).
 *
 * Decisions (also in `docs/spec/features/desktop-app/tech.md`):
 * - Baseline: only a due time strictly after `startedAt` (the moment this window opened) can
 *   fire. Anything that passed while the window was closed is skipped at launch; Today's Overdue
 *   group covers it (R40).
 * - Timezone: `due` is floating local time (`lib/dates.ts` `parseDue`), so the comparison is
 *   against the local wall clock. An offset-suffixed value is absolute and honoured as such.
 * - Dedupe key is `id@due`: one occurrence fires once, and a reschedule or the next recurrence
 *   is a new occurrence that re-arms.
 */
import { parseDue } from "./dates";
import type { Task } from "./types";

export interface Reminder {
  /** `id@due` — one occurrence of one task. */
  key: string;
  id: string;
  title: string;
  /** The project **id**; the surface resolves it to a title (`useProjects`). */
  project: string | null;
  due: string;
}

/** The "already raised (or dismissed)" set. Injected so a test can disable the dedupe. */
export interface ReminderLog {
  has(key: string): boolean;
  add(key: string): void;
}

/** The shipping log: one window remembers what it has raised and dismissed. */
export function memoryLog(): ReminderLog {
  const seen = new Set<string>();
  return {
    has: (key) => seen.has(key),
    add: (key) => {
      seen.add(key);
    },
  };
}

/** A log that never remembers — for the negative control only, never for the app. */
export function forgetfulLog(): ReminderLog {
  return { has: () => false, add: () => {} };
}

export interface ReminderScheduler {
  /** The reminders this tick should raise; each occurrence is marked raised before it returns. */
  tick(tasks: readonly Task[], now: Date): Reminder[];
  /** The notice was dismissed: no further notice for this occurrence. */
  dismiss(key: string): void;
  readonly log: ReminderLog;
}

export interface ReminderSchedulerOptions {
  /** When the app window opened (ms since epoch). Earlier due times never fire. */
  startedAt: number;
  log?: ReminderLog;
}

export function createReminderScheduler({ startedAt, log = memoryLog() }: ReminderSchedulerOptions): ReminderScheduler {
  return {
    log,
    dismiss: (key) => log.add(key),
    tick(tasks, now) {
      const raised: Reminder[] = [];
      const nowMs = now.getTime();
      for (const task of tasks) {
        // Only work that is still open can remind; completed and cancelled tasks are done.
        if (task.status !== "open" && task.status !== "claimed") continue;
        const due = task.due;
        if (!due) continue;
        const parsed = parseDue(due);
        // Untimed (date only) and unparseable due strings never remind.
        if (!parsed?.hasTime) continue;
        const at = parsed.date.getTime();
        // Came due before this window opened: skipped, not replayed (R40).
        if (at <= startedAt) continue;
        // Not yet.
        if (at > nowMs) continue;
        const key = `${task.id}@${due}`;
        if (log.has(key)) continue;
        log.add(key);
        raised.push({ key, id: task.id, title: task.title, project: task.project ?? null, due });
      }
      return raised;
    },
  };
}

/** What the notice shows and does, independent of the surface that renders it. */
export interface ReminderNotice {
  title: string;
  /** The project, when the task has one. */
  body: string | undefined;
  /** Choosing the notice: bring the task up (the host/window focus is the surface's job). */
  open: () => void;
  /** Closing the notice without opening it. */
  dismiss: () => void;
}

export function reminderNotice(
  reminder: Reminder,
  actions: { open: (id: string) => void; dismiss: (key: string) => void; projectTitle?: string | null },
): ReminderNotice {
  return {
    title: reminder.title,
    // The title, never the project id: an unknown project drops the line instead of showing `n-…`.
    body: actions.projectTitle || undefined,
    open: () => {
      actions.open(reminder.id);
      actions.dismiss(reminder.key);
    },
    dismiss: () => actions.dismiss(reminder.key),
  };
}
