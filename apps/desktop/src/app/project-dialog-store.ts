/**
 * Open/close state for the global "Add project" dialog, callable from anywhere (the sidebar "+",
 * the empty-list row and the command palette). Mirrors `quickadd-store`.
 */
import { useSyncExternalStore } from "react";

interface State {
  open: boolean;
  /** Bumped on every open so the dialog starts from an empty title. */
  nonce: number;
}

let state: State = { open: false, nonce: 0 };
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

export function openAddProject() {
  set({ open: true, nonce: state.nonce + 1 });
}

export function closeAddProject() {
  set({ ...state, open: false });
}

/** Close only if the dialog that asks is still the one on screen (a slow submit must not close a newer one). */
export function closeAddProjectFrom(nonce: number) {
  if (state.nonce === nonce) closeAddProject();
}

export function useAddProjectState(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
