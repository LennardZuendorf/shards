import { createContext, useContext, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

/** A target-scoped editor controller survives replacement of responsive presentation wrappers. */
export function createDetailDraftStore() {
  const values = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  let relocating = false;
  let interaction: { field: string | null; start: number | null; end: number | null; scroll: number[]; main: number } | null = null;
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    read<T>(key: string, initial: T): T {
      if (!values.has(key)) values.set(key, initial);
      return values.get(key) as T;
    },
    write<T>(key: string, next: SetStateAction<T>) {
      const old = values.get(key) as T;
      const value = typeof next === "function" ? (next as (previous: T) => T)(old) : next;
      if (Object.is(old, value)) return;
      values.set(key, value); listeners.forEach(fn => fn());
    },
    isRelocating: () => relocating,
    wasEditing: () => !!interaction?.field,
    capture() {
      if (typeof document === "undefined") return;
      const root = document.querySelector("[data-detail-root]");
      if (!root) return;
      const field = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
      relocating = true;
      interaction = {
        field: field && root.contains(field) ? field.getAttribute("data-detail-field") : null,
        start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null,
        scroll: Array.from(root.querySelectorAll("[data-detail-scroll]")).map(el => el.scrollTop),
        main: document.getElementById("main")?.scrollTop ?? 0,
      };
    },
    restore() {
      if (!relocating || typeof document === "undefined") return true;
      const root = document.querySelector("[data-detail-root]");
      if (!root) return false;
      if (root && interaction) {
        const state = interaction;
        if (state.field) {
          const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-detail-field="${CSS.escape(state.field)}"]`);
          if (!field) return false;
          field?.focus({ preventScroll: true });
          if (field && state.start !== null && state.end !== null) field.setSelectionRange(state.start, state.end);
        }
        root.querySelectorAll("[data-detail-scroll]").forEach((el, i) => { el.scrollTop = state.scroll[i] ?? 0; });
        const main = document.getElementById("main"); if (main) main.scrollTop = state.main;
      }
      relocating = false;
      return true;
    },
  };
}
type DraftStore = ReturnType<typeof createDetailDraftStore>;
export const DraftContext = createContext<DraftStore | null>(null);
const noopSubscribe = () => () => {};

export const useDetailDraftController = () => useContext(DraftContext);

export function useDetailDraftState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(DraftContext);
  const fallback = useState(initial);
  const value = useSyncExternalStore(store?.subscribe ?? noopSubscribe, () => store ? store.read(key, initial) : fallback[0], () => initial);
  return store ? [value, next => store.write(key, next)] : fallback;
}
