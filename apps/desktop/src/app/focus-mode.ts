import { useSyncExternalStore } from "react";
import type { RouteName } from "@/lib/router";

export function canFocus(route: RouteName, board: boolean): boolean {
  return !board && ["inbox", "today", "upcoming", "project", "label"].includes(route);
}

/** View registration, not sidebar preference, owns temporary Focus eligibility. */
export function createFocusModeStore() {
  let active = false, eligible = false, destination = "", generation = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const set = (next: boolean) => {
    const value = next && eligible;
    if (value !== active) { active = value; emit(); }
  };
  return {
    subscribe, getSnapshot: () => active, getEligibleSnapshot: () => eligible,
    use: () => useSyncExternalStore(subscribe, () => active, () => false),
    useEligible: () => useSyncExternalStore(subscribe, () => eligible, () => false),
    set, toggle: () => set(!active),
    registerView(routeKey: string, allowed: boolean) {
      const token = ++generation;
      if (destination !== routeKey || !allowed) active = false;
      destination = routeKey; eligible = allowed; emit();
      return () => {
        if (token !== generation) return;
        destination = ""; eligible = false; active = false; emit();
      };
    },
  };
}
export const focusModeStore = createFocusModeStore();
