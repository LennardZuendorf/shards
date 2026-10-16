/**
 * The wall clock for render code. Calling `new Date()` while rendering is impure (two renders of
 * the same state can disagree); components read one shared clock instead, which ticks once a
 * minute so "today", "overdue" and the sidebar counts still roll over at midnight.
 */
import { useMemo, useSyncExternalStore } from "react";
import { toDateKey } from "./dates";

const TICK_MS = 60_000;
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  current = Date.now();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    // The clock may be stale after a period with no subscriber.
    current = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => current;

/** The current time, stable within a render and refreshed every minute. */
export function useNow(): Date {
  const ms = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => new Date(ms), [ms]);
}

const todaySnapshot = () => toDateKey(new Date(current));

/** Today's local `YYYY-MM-DD`, a primitive that changes only when the day rolls over. */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, todaySnapshot, todaySnapshot);
}
