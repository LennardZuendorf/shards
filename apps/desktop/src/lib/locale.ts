/**
 * Locale preferences (R38): week start, 12/24-hour clock and date order come from the system
 * locale, with a per-device override persisted in localStorage (`shards-week-start`,
 * `shards-hour-cycle`, `shards-date-order`). Presentation only: the vault keeps ISO dates.
 *
 * Same store pattern as `theme.ts`: a module-level cache, `useSyncExternalStore` for React and an
 * optional `startLocaleSync()` for OS/other-window changes. `localePrefs()` is the plain getter
 * every formatter calls.
 */
import { useSyncExternalStore } from "react";

/** date-fns `weekStartsOn` numbering: 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;
export type HourCycle = "h12" | "h24";
export type DateOrder = "mdy" | "dmy";

export interface LocaleDefaults {
  weekStart: WeekStart;
  hourCycle: HourCycle;
  dateOrder: DateOrder;
}

export interface LocalePrefs {
  weekStart: WeekStart;
  hourCycle: HourCycle;
  dateOrder: DateOrder;
  /** What the system locale says, whatever the overrides are. */
  system: LocaleDefaults;
  /** A null entry means "follow the system" for that preference — what Settings shows as System. */
  overrides: {
    weekStart: WeekStart | null;
    hourCycle: HourCycle | null;
    dateOrder: DateOrder | null;
  };
}

export const WEEK_START_KEY = "shards-week-start";
export const HOUR_CYCLE_KEY = "shards-hour-cycle";
export const DATE_ORDER_KEY = "shards-date-order";

const WEEK_STARTS: readonly number[] = [0, 1];
const HOUR_CYCLES: readonly string[] = ["h12", "h24"];
const DATE_ORDERS: readonly string[] = ["mdy", "dmy"];

/**
 * Parse a stored override; anything outside the allowed values (or absent) means "follow the
 * system". Invalid storage must never become a preference.
 */
function parseWeekStart(value: string | null | undefined): WeekStart | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return WEEK_STARTS.includes(n) ? (n as WeekStart) : null;
}

function parseHourCycle(value: string | null | undefined): HourCycle | null {
  return typeof value === "string" && HOUR_CYCLES.includes(value) ? (value as HourCycle) : null;
}

function parseDateOrder(value: string | null | undefined): DateOrder | null {
  return typeof value === "string" && DATE_ORDERS.includes(value) ? (value as DateOrder) : null;
}

function localeWeekStart(tag: string): WeekStart {
  try {
    const Locale = Intl.Locale;
    const loc = new Locale(tag) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    // Safari used to expose only the getter; Chromium/WebKit now have the getter too.
    const info = "weekInfo" in loc && loc.weekInfo ? loc.weekInfo : loc.getWeekInfo?.();
    if (info?.firstDay === 7) return 0; // Sunday
    if (info?.firstDay === 1) return 1; // Monday
  } catch {
    /* unknown tag or no week info: the spec's fallback is Monday */
  }
  return 1;
}

function localeHourCycle(tag: string): HourCycle {
  try {
    return new Intl.DateTimeFormat(tag, { hour: "numeric" }).resolvedOptions().hour12 === true ? "h12" : "h24";
  } catch {
    return "h24";
  }
}

function localeDateOrder(tag: string): DateOrder {
  try {
    // 3 Dec 2026: a day above 12 cannot be confused with a month.
    const parts = new Intl.DateTimeFormat(tag, { day: "numeric", month: "numeric" }).formatToParts(
      new Date(2026, 11, 3),
    );
    const first = parts.find((p) => p.type === "month" || p.type === "day")?.type;
    return first === "day" ? "dmy" : "mdy";
  } catch {
    return "mdy";
  }
}

/** Locale defaults for a BCP-47 tag (default: the system locale). Pure. */
export function systemLocaleDefaults(locale?: string): LocaleDefaults {
  let tag = locale;
  if (!tag) {
    try {
      tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      tag = "en";
    }
  }
  return {
    weekStart: localeWeekStart(tag),
    hourCycle: localeHourCycle(tag),
    dateOrder: localeDateOrder(tag),
  };
}

/** `undefined` = storage unavailable; `null` = key absent. */
function readKey(key: string): string | null | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

interface Overrides {
  weekStart: WeekStart | null;
  hourCycle: HourCycle | null;
  dateOrder: DateOrder | null;
}

let overrides: Overrides = { weekStart: null, hourCycle: null, dateOrder: null };
let system: LocaleDefaults = systemLocaleDefaults();
let snapshot: LocalePrefs = resolve();
const listeners = new Set<() => void>();

function resolve(): LocalePrefs {
  return {
    weekStart: overrides.weekStart ?? system.weekStart,
    hourCycle: overrides.hourCycle ?? system.hourCycle,
    dateOrder: overrides.dateOrder ?? system.dateOrder,
    system: { ...system },
    overrides: { ...overrides },
  };
}

/** Re-read the three keys, keeping session-only values when storage is unavailable. */
function syncFromStorage() {
  const weekStart = readKey(WEEK_START_KEY);
  const hourCycle = readKey(HOUR_CYCLE_KEY);
  const dateOrder = readKey(DATE_ORDER_KEY);
  const next: Overrides = {
    weekStart: weekStart === undefined ? overrides.weekStart : parseWeekStart(weekStart),
    hourCycle: hourCycle === undefined ? overrides.hourCycle : parseHourCycle(hourCycle),
    dateOrder: dateOrder === undefined ? overrides.dateOrder : parseDateOrder(dateOrder),
  };
  if (
    next.weekStart === overrides.weekStart &&
    next.hourCycle === overrides.hourCycle &&
    next.dateOrder === overrides.dateOrder
  ) {
    return;
  }
  overrides = next;
  snapshot = resolve();
}

function commit() {
  snapshot = resolve();
  listeners.forEach((l) => l());
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    /* storage unavailable: the override still applies for this session */
    return false;
  }
}

/** Effective prefs now: override if stored, else the system default. Non-reactive getter. */
export function localePrefs(): LocalePrefs {
  syncFromStorage();
  return snapshot;
}

/** Store a week-start override (0 Sunday, 1 Monday); `null` follows the system locale again. */
export function setWeekStart(v: WeekStart | null) {
  if (!write(WEEK_START_KEY, v === null ? null : String(v))) overrides.weekStart = v;
  else syncFromStorage();
  commit();
}

/** Store a 12/24-hour clock override; `null` follows the system locale again. */
export function setHourCycle(v: HourCycle | null) {
  if (!write(HOUR_CYCLE_KEY, v)) overrides.hourCycle = v;
  else syncFromStorage();
  commit();
}

/** Store a day/month order override; `null` follows the system locale again. */
export function setDateOrder(v: DateOrder | null) {
  if (!write(DATE_ORDER_KEY, v)) overrides.dateOrder = v;
  else syncFromStorage();
  commit();
}

/** Test helper: clear all three overrides and re-detect. */
export function resetLocalePrefs(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(WEEK_START_KEY);
      localStorage.removeItem(HOUR_CYCLE_KEY);
      localStorage.removeItem(DATE_ORDER_KEY);
    }
  } catch {
    /* storage unavailable: clearing the cache is enough */
  }
  overrides = { weekStart: null, hourCycle: null, dateOrder: null };
  system = systemLocaleDefaults();
  commit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive prefs incl. setters; a null argument clears that override back to the system default. */
export function useLocalePrefs(): LocalePrefs & {
  setWeekStart(v: WeekStart | null): void;
  setHourCycle(v: HourCycle | null): void;
  setDateOrder(v: DateOrder | null): void;
} {
  const prefs = useSyncExternalStore(subscribe, localePrefs, localePrefs);
  return { ...prefs, setWeekStart, setHourCycle, setDateOrder };
}

/**
 * Re-render a component when any preference changes. Formatters (`lib/dates`) read the store
 * directly, so this is the subscription half of the one helper: call it once in each component
 * that renders a date, a time or a week boundary.
 */
export function useLocaleChanges(): void {
  useSyncExternalStore(subscribe, localePrefs, localePrefs);
}

/**
 * Re-read the overrides on other-window changes. Optional: the store works without it, so tests
 * and the CLI surfaces never need a window.
 */
export function startLocaleSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === WEEK_START_KEY || e.key === HOUR_CYCLE_KEY || e.key === DATE_ORDER_KEY || e.key === null) {
      syncFromStorage();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
