/** Open/close state for the global Quick Add dialog, callable from anywhere. */
import { useSyncExternalStore } from "react";
import type { Priority } from "@/lib/types";

export interface QuickAddDefaults {
  /** Project id. */
  project?: string;
  section?: string;
  /** Floating due string. */
  due?: string;
  labels?: string[];
  priority?: Priority;
  owner?: string;
  /** Parent task id (adds a subtask). */
  parent?: string;
  /** Prefill the input text. */
  text?: string;
}

interface State {
  open: boolean;
  defaults: QuickAddDefaults | null;
  /** Bumped on every open so the dialog can reset. */
  nonce: number;
}

let state: State = { open: false, defaults: null, nonce: 0 };
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Open Quick Add. Without defaults it infers context from the current route. */
export function openQuickAdd(defaults?: QuickAddDefaults) {
  set({ open: true, defaults: defaults ?? null, nonce: state.nonce + 1 });
}

export function closeQuickAdd() {
  set({ ...state, open: false });
}

export function useQuickAddState(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
