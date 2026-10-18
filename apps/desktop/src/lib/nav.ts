/**
 * Navigation helpers (desktop-app/36): the one nav order (`app/nav-lists.ts` derives the sidebar, `g` chord and
 * palette lists from it), plus the remembered section and sidebar state. Sections and keys come
 * from `ui-contract.ts`; route titles, icons and hotkeys stay in `app/routes.tsx`.
 */
import type { RouteName } from "./router";
import { NAV_SECTIONS, PREF_KEYS, navRoutes, type NavSectionId } from "./ui-contract";

/** The slice of `Storage` used here, so tests can pass a fake. */
export type KV = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string, kv: KV | null): string | null {
  try {
    return kv?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string, kv: KV | null) {
  try {
    kv?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Search on top, the sections in order, Settings in the footer. */
export function shellRoutes(): RouteName[] {
  return ["search", ...navRoutes(), "settings"];
}

/* ---------------------------------------------------------------- remembered state */

const SECTION_IDS = new Set<string>(NAV_SECTIONS.map((s) => s.id));

/** Collapsed section ids; unknown or corrupt values are dropped. */
export function readCollapsed(kv: KV | null = defaultStore()): NavSectionId[] {
  try {
    const v: unknown = JSON.parse(read(PREF_KEYS.navCollapsed, kv) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is NavSectionId => typeof x === "string" && SECTION_IDS.has(x)) : [];
  } catch {
    return [];
  }
}

/** Flip one section and persist; returns the new collapsed list. */
export function toggleCollapsed(id: NavSectionId, kv: KV | null = defaultStore()): NavSectionId[] {
  const cur = readCollapsed(kv);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  write(PREF_KEYS.navCollapsed, JSON.stringify(next), kv);
  return next;
}

/** Sidebar open state; open unless a previous run closed it. */
export function readSidebarOpen(kv: KV | null = defaultStore()): boolean {
  return read(PREF_KEYS.sidebarOpen, kv) !== "0";
}

export function writeSidebarOpen(open: boolean, kv: KV | null = defaultStore()) {
  write(PREF_KEYS.sidebarOpen, open ? "1" : "0", kv);
}
