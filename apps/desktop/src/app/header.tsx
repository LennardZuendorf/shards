/**
 * Header slots views can fill without owning the shell:
 *
 *   <HeaderActions><ViewOptions /></HeaderActions>      // portals into the header's right side
 *   useHeaderTitle(project?.title ?? null)              // overrides the route title / breadcrumb leaf
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HEADER_ACTIONS_ID = "shards-header-actions";

let actionsEl: HTMLElement | null = null;
const elListeners = new Set<() => void>();

/** Callback ref for the header's action container (AppShell only). */
export function setHeaderActionsEl(el: HTMLElement | null) {
  if (el === actionsEl) return;
  actionsEl = el;
  elListeners.forEach((l) => l());
}

let titleOverride: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useHeaderTitle(title: string | null) {
  useEffect(() => {
    titleOverride = title;
    emit();
    return () => {
      if (titleOverride === title) {
        titleOverride = null;
        emit();
      }
    };
  }, [title]);
}

export function useHeaderTitleOverride(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => titleOverride,
  );
}

/** Render children into the header's action area (right side, before the global buttons). */
export function HeaderActions({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(
    (cb) => {
      elListeners.add(cb);
      return () => elListeners.delete(cb);
    },
    () => actionsEl,
  );
  return el ? createPortal(children, el) : null;
}
