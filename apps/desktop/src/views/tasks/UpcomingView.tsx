import { addDays, addWeeks, format, isSameDay, isSameMonth, startOfDay, startOfWeek } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DisplayMenu } from "@/components/task/DisplayMenu";
import { FilterChips } from "@/components/task/FilterChips";
import { FilterMenu } from "@/components/task/FilterMenu";
import { upcomingGroups, upcomingRange } from "@/components/task/group-specs";
import { useViewOptions } from "@/components/task/hooks";
import { TaskList, type TaskGroupSpec } from "@/components/task/TaskList";
import { TaskListSkeleton, TaskQueryError, TaskView } from "@/components/task/TaskView";
import { toDateKey } from "@/lib/dates";
import { useMe, useTasks } from "@/lib/hooks";
import { useTaskScope } from "@/lib/scope";
import { applyViewOptions, isStaticGrouping } from "@/lib/view-options";
import { useOthersGroup } from "@/components/task/others-group";
import { ScopeToggle } from "@/components/task/ScopeToggle";
import { cn } from "@/lib/utils";
import { useTodayKey } from "@/lib/now";

/** Upcoming: a week strip to jump around, then one group per day (empty days included). */
export function UpcomingView() {
  const q = useTasks();
  const me = useMe();
  const [scope, setScope] = useTaskScope("upcoming");
  const todayKey = useTodayKey();
  const today = startOfDay(new Date(`${todayKey}T00:00`));
  const [week, setWeek] = useState(0);
  const [active, setActive] = useState(toDateKey(today));
  const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), week);
  const stripDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const lastStrip = stripDays[6];
  const vo = useViewOptions("upcoming");
  const days = useMemo(() => upcomingRange(todayKey, week), [todayKey, week]);
  const built = useMemo(() => upcomingGroups(q.data ?? [], days, scope, me), [q.data, days, scope, me]);
  const { byDay, others } = built;
  const othersGroup = useOthersGroup(others);

  const counts = (d: Date) => byDay.get(toDateKey(d))?.length ?? 0;

  // Day headers carry the anchor the week strip scrolls to.
  const delivered: TaskGroupSpec[] = built.groups.map((g) =>
    g.key.startsWith("day:")
      ? { ...g, title: <span id={`day-${g.key.slice(4)}`} className="scroll-mt-28">{g.title}</span> }
      : g,
  );
  if (othersGroup) delivered.push(othersGroup);
  const groups = applyViewOptions(delivered, vo.options, vo.ctx);

  // Highlight the day group nearest the top while scrolling.
  const main = useRef<HTMLElement | null>(null);
  useEffect(() => {
    main.current = document.getElementById("main");
    const el = main.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top + 120;
      let cur: string | null = null;
      for (const h of el.querySelectorAll<HTMLElement>("[id^='day-']")) {
        if (h.getBoundingClientRect().top <= top) cur = h.id.slice(4);
      }
      if (cur) setActive(cur);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (d: Date) => {
    const key = toDateKey(d);
    setActive(key);
    requestAnimationFrame(() => document.getElementById(`day-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const strip = (
    <div className="sticky top-0 z-10 -mx-2 mb-2 border-b border-border/70 bg-background px-2 pt-1 pb-2 shadow-[0_6px_12px_-10px_rgb(0_0_0/0.25)]">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-small font-semibold">
          {format(weekStart, "MMMM yyyy")}
          {!isSameMonth(weekStart, lastStrip) && <span className="text-muted-foreground"> – {format(lastStrip, "MMMM")}</span>}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Previous week" disabled={week <= 0} onClick={() => setWeek((w) => Math.max(0, w - 1))}>
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              setWeek(0);
              jump(today);
            }}
          >
            Today
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Next week" onClick={() => setWeek((w) => w + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {stripDays.map((d) => {
          const past = d < today;
          const n = counts(d);
          const isActive = toDateKey(d) === active;
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={past}
              onClick={() => jump(d)}
              className={cn(
                "flex flex-col items-center rounded-lg py-1.5 text-xs transition-colors",
                past ? "cursor-default text-muted-foreground/40" : "hover:bg-accent",
                isActive && !past && "bg-accent text-foreground",
              )}
            >
              <span className="text-micro tracking-wide uppercase opacity-80">{format(d, "EEE")}</span>
              <span className={cn("mt-0.5 text-heading leading-5 font-semibold tabular-nums", isSameDay(d, today) && !isActive && "text-foreground")}>{format(d, "d")}</span>
              <span className={cn("mt-1 h-1 w-1 rounded-full", n ? (isActive ? "bg-primary" : "bg-muted-foreground/50") : "bg-transparent")} />
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <TaskView
      title="Upcoming"
      below={<FilterChips filters={vo.options.filters} onChange={vo.setFilters} />}
      toolbar={
        <>
          <FilterMenu filters={vo.options.filters} onChange={vo.setFilters} />
          <DisplayMenu options={vo.options} onChange={vo.set} defaultLabel="Days" />
          <ScopeToggle value={scope} onChange={setScope} />
        </>
      }
    >
      {strip}
      {q.isLoading ? (
        <TaskListSkeleton groups={3} rows={2} />
      ) : q.error && !q.data ? (
        <TaskQueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <TaskList
          groups={groups}
          storageKey="upcoming"
          rowProps={{ showProject: true, showDue: true, density: vo.options.density }}
          sorted={vo.options.sort !== "manual"}
          static={isStaticGrouping(vo.options)}
          filters={{ value: vo.options.filters, onChange: vo.setFilters }}
        />
      )}
    </TaskView>
  );
}
