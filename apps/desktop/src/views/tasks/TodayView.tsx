import { format, startOfDay } from "date-fns";
import { CalendarClockIcon, PartyPopperIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePatchMany } from "@/components/task/actions";
import { compareByDue } from "@/components/task/model";
import { ScheduleContent } from "@/components/task/pickers";
import { TaskComposer } from "@/components/task/TaskComposer";
import { TaskList, type TaskGroupSpec } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { dueBucket, moveDueToDay, parseDue, toDateKey } from "@/lib/dates";
import { useMe, useTasks } from "@/lib/hooks";
import { splitMine, useTaskScope } from "@/lib/scope";
import { useOthersGroup } from "@/components/task/others-group";
import { ScopeToggle } from "@/components/task/ScopeToggle";
import { toastWithUndo } from "@/lib/query";
import { taskUpdate } from "@/lib/api";
import type { Task } from "@/lib/types";

/** Today: an Overdue group (with "Reschedule") and today's tasks. */
export function TodayView() {
  const q = useTasks();
  const me = useMe();
  const [scope, setScope] = useTaskScope("today");
  const now = new Date();
  const todayKey = toDateKey(now);
  const { overdue, today, others } = useMemo(() => {
    const o: Task[] = [];
    const t: Task[] = [];
    for (const x of q.data ?? []) {
      if (x.status !== "open" && x.status !== "claimed") continue;
      const b = dueBucket(x.due);
      if (b === "overdue") o.push(x);
      else if (b === "today") t.push(x);
    }
    if (scope === "everyone") return { overdue: o, today: t, others: [] as Task[] };
    // Mine: the plan of the acting human; delegated work waits in a collapsed group.
    const so = splitMine(o, me);
    const st = splitMine(t, me);
    return { overdue: so.mine, today: st.mine, others: [...so.others, ...st.others] };
    // todayKey: recompute when the day rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, todayKey, scope, me]);
  const total = overdue.length + today.length;
  const othersGroup = useOthersGroup(others);

  const groups: TaskGroupSpec[] = [];
  if (overdue.length) {
    groups.push({
      key: "overdue",
      title: "Overdue",
      tone: "danger",
      tasks: overdue,
      compare: compareByDue,
      actions: <RescheduleOverdue tasks={overdue} />,
      dropArgs: () => null,
    });
  }
  groups.push({
    key: "today",
    title: overdue.length ? `${format(now, "d MMM")} · Today · ${format(now, "EEEE")}` : undefined,
    tasks: today,
    compare: compareByDue,
    collapsible: false,
    addDefaults: { due: todayKey },
    dropArgs: (t) => ({ due: moveDueToDay(t.due, startOfDay(new Date())) }),
    empty: overdue.length ? <p className="py-3 text-[13px] text-muted-foreground">Nothing else due today.</p> : undefined,
  });
  if (othersGroup) groups.push(othersGroup);

  return (
    <TaskView
      title="Today"
      toolbar={<ScopeToggle value={scope} onChange={setScope} />}
      subtitle={
        <>
          <span>{format(now, "EEEE, d MMMM")}</span>
          {q.data && <span className="text-muted-foreground/40">·</span>}
          {q.data && (
            <span className="inline-flex items-center gap-1">
              {total ? `${total} task${total > 1 ? "s" : ""}` : "All clear"}
              {overdue.length > 0 && <span className="text-due-overdue">({overdue.length} overdue)</span>}
              {others.length > 0 && <span className="text-muted-foreground">· {others.length} delegated</span>}
            </span>
          )}
        </>
      }
    >
      {q.isLoading ? (
        <TaskListSkeleton groups={2} rows={4} />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : total === 0 && !othersGroup ? (
        <>
          <TaskComposer defaults={{ due: todayKey }} />
          <EmptyState
            icon={PartyPopperIcon}
            tone="success"
            title="You’re all done for today"
            description="Enjoy the rest of your day. Anything new you add here is due today."
          />
        </>
      ) : (
        <TaskList groups={groups} storageKey="today" rowProps={{ showProject: true }} />
      )}
    </TaskView>
  );
}

function RescheduleOverdue({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const patchMany = usePatchMany();
  const apply = (day: Date | null) => {
    setOpen(false);
    const items = tasks.map((t) => ({ task: t, args: { due: day ? moveDueToDay(t.due, day) : null } }));
    const before = tasks.map((t) => ({ id: t.id, due: t.due ?? "" }));
    patchMany.mutate(items, {
      onSuccess: () =>
        toastWithUndo(
          `Rescheduled ${tasks.length} task${tasks.length > 1 ? "s" : ""}`,
          () => Promise.all(before.map((b) => taskUpdate(b.id, { due: b.due }))),
        ),
    });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-primary hover:text-primary">
          <CalendarClockIcon /> Reschedule
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">Move {tasks.length} overdue to…</span>
          <Button size="xs" onClick={() => apply(startOfDay(new Date()))}>
            Today
          </Button>
        </div>
        <ScheduleContent due={null} onPick={(d) => apply(d ? (parseDue(d)?.date ?? null) : null)} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
