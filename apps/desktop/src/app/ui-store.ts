/** Tiny global open/close stores for shell overlays (palette, shortcuts sheet). */
import { useSyncExternalStore } from "react";

function toggleStore() {
  let open = false;
  const ls = new Set<() => void>();
  const set = (v: boolean) => {
    if (v === open) return;
    open = v;
    ls.forEach((l) => l());
  };
  return {
    set,
    toggle: () => set(!open),
    use: () =>
      useSyncExternalStore(
        (cb) => {
          ls.add(cb);
          return () => ls.delete(cb);
        },
        () => open,
      ),
  };
}

export const paletteStore = toggleStore();
export const shortcutsStore = toggleStore();

export const openCommandPalette = () => paletteStore.set(true);
export const openShortcuts = () => shortcutsStore.set(true);
