/**
 * Mounts the in-window reminder scheduler (R40, desktop-app/30) on the shared minute clock.
 *
 * The timer is the app's one `setInterval(60_000)` in `lib/now.ts`: subscribing adds no new
 * interval, and due strings are minute-precision, so a minute tick satisfies R40's 60 s bound
 * (worst case 59 s late) without a polling loop. A host-side tick would need a new host tool and
 * could not know the viewer's local zone.
 *
 * The notice is an in-app toast (`sonner`), like the rest of the app's feedback. The OS
 * notification permission path and tray/closed-window delivery are app-polish (AP1).
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useProjects, useTasks } from "@/lib/hooks";
import { useNow } from "@/lib/now";
import { createReminderScheduler, reminderNotice, type Reminder } from "@/lib/reminders";
import { openTask } from "./detail";

/** A reminder stays until the operator opens or dismisses it. */
const REMINDER_DURATION = Number.POSITIVE_INFINITY;

interface Live {
  id: string;
  due: string;
}

function raise(
  reminder: Reminder,
  projectTitle: string | undefined,
  dismissNotice: (key: string) => void,
  forget: (key: string) => void,
) {
  const notice = reminderNotice(reminder, { open: openTask, dismiss: dismissNotice, projectTitle });
  toast(notice.title, {
    // The occurrence key: re-raising the same one would update the toast, never stack it.
    id: reminder.key,
    description: notice.body,
    duration: REMINDER_DURATION,
    closeButton: true,
    action: { label: "Open", onClick: notice.open },
    // Closed without choosing it (the close button, Escape, a swipe): same effect as dismissing.
    onDismiss: () => forget(reminder.key),
  });
}

/** Draws no UI: it runs the scheduler whenever the loaded set or the minute clock changes. */
export function Reminders() {
  const tasks = useTasks();
  const projects = useProjects();
  const now = useNow();
  /** `id@due` → the occurrence behind each notice currently on screen. */
  const live = useRef(new Map<string, Live>());
  // The window's open time is the baseline: due times that passed earlier are skipped, not
  // replayed (R40). Lazy init keeps it stable across the minute-clock re-renders.
  const [scheduler] = useState(() => createReminderScheduler({ startedAt: Date.now() }));

  useEffect(() => {
    const rows = tasks.data;
    if (!rows) return;
    const byId = new Map(rows.map((t) => [t.id, t]));
    const projectTitles = new Map((projects.data ?? []).map((p) => [p.id, p.title]));

    // A notice lives only while its occurrence does: completing, cancelling, deleting or
    // rescheduling the task takes the toast away instead of leaving a stale one on screen.
    for (const [key, shown] of live.current) {
      const task = byId.get(shown.id);
      if (!task || task.due !== shown.due) {
        toast.dismiss(key);
        scheduler.dismiss(key);
        live.current.delete(key);
      }
    }

    const forget = (key: string) => {
      live.current.delete(key);
      scheduler.dismiss(key);
    };
    const dismissNotice = (key: string) => {
      toast.dismiss(key);
      forget(key);
    };

    for (const reminder of scheduler.tick(rows, now)) {
      live.current.set(reminder.key, { id: reminder.id, due: reminder.due });
      raise(reminder, projectTitles.get(reminder.project ?? ""), dismissNotice, forget);
    }
  }, [tasks.data, projects.data, now, scheduler]);

  return null;
}
