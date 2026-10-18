/**
 * Whether a task list is filtered to zero rows. The empty state (R28) then owns the only
 * "Clear filters" button, so the chips bar hides its own (no duplicate buttons).
 */
import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Marks the zero state as shown; returns the (idempotent) leave callback. */
export function enterFilteredToZero(): () => void {
  count++;
  emit();
  let left = false;
  return () => {
    if (left) return;
    left = true;
    count--;
    emit();
  };
}

export const isFilteredToZero = () => count > 0;

export function useFilteredToZero(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isFilteredToZero,
    () => false,
  );
}
