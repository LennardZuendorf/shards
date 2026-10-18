import { format, startOfDay } from "date-fns";
import { CalendarClockIcon, PartyPopperIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePatchMany } from "@/components/task/actions";
import { ScheduleContent } from "@/components/task/pickers";
import { TaskComposer } from "@/components/task/TaskComposer";
import { DisplayMenu } from "@/components/task/DisplayMenu";
import { FilterChips } from "@/components/task/FilterChips";
import { FilterMenu } from "@/components/task/FilterMenu";
import { todayGroups, todaySets } from "@/components/task/group-specs";
import { useViewOptions } from "@/components/task/hooks";
import { TaskList, type TaskGroupSpec } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { moveDueToDay, parseDue, toDateKey } from "@/lib/dates";
import { useMe, useTasks } from "@/lib/hooks";
import { useTaskScope } from "@/lib/scope";
import { applyViewOptions, isStaticGrouping } from "@/lib/view-options";
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
  const vo = useViewOptions("today");
  // Mine: the plan of the acting human; delegated work waits in a collapsed group.
  // todayKey: recompute when the day rolls over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sets = useMemo(() => todaySets(q.data ?? [], new Date(), scope, me), [q.data, todayKey, scope, me]);
  const { overdue, today, others } = sets;
  const total = overdue.length + today.length;
  const othersGroup = useOthersGroup(others);

  const delivered: TaskGroupSpec[] = todayGroups(sets, now).map((g) =>
    g.key === "overdue"
      ? { ...g, actions: <RescheduleOverdue tasks={overdue} /> }
      : { ...g, empty: overdue.length ? <p className="py-3 text-[13px] text-muted-foreground">Nothing else due today.</p> : undefined },
  );
  if (othersGroup) delivered.push(othersGroup);
  const groups = applyViewOptions(delivered, vo.options, vo.ctx);

  return (
    <TaskView
      title="Today"
      below={<FilterChips filters={vo.options.filters} onChange={vo.setFilters} />}
      toolbar={
        <>
          <FilterMenu filters={vo.options.filters} onChange={vo.setFilters} />
          <DisplayMenu options={vo.options} onChange={vo.set} defaultLabel="Overdue, Today" />
          <ScopeToggle value={scope} onChange={setScope} />
        </>
      }
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
        <TaskList
          groups={groups}
          storageKey="today"
          rowProps={{ showProject: true, density: vo.options.density }}
          sorted={vo.options.sort !== "manual"}
          static={isStaticGrouping(vo.options)}
          filters={{ value: vo.options.filters, onChange: vo.setFilters }}
        />
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
        <Button variant="ghost" size="xs" className="text-foreground">
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
