import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATE_ORDER_KEY,
  HOUR_CYCLE_KEY,
  WEEK_START_KEY,
  localePrefs,
  resetLocalePrefs,
  setDateOrder,
  setHourCycle,
  setWeekStart,
  startLocaleSync,
  systemLocaleDefaults,
  useLocalePrefs,
} from "./locale";

/** Minimal in-memory localStorage: Node has none, the module guards every access. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

/**
 * The hook needs a renderer; server rendering uses `getServerSnapshot`, which the store supports.
 * Its values come back out of the markup rather than a captured variable — no side effect in render.
 */
function hookMarkup(): string {
  const Probe = () => {
    const { weekStart, hourCycle, dateOrder, setWeekStart: w, setHourCycle: h, setDateOrder: d } = useLocalePrefs();
    return createElement("i", {
      "data-prefs": `${weekStart}|${hourCycle}|${dateOrder}`,
      "data-setters": [w, h, d].map((f) => typeof f).join(","),
    });
  };
  return renderToStaticMarkup(createElement(Probe));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  resetLocalePrefs();
});

afterEach(() => {
  resetLocalePrefs();
  vi.unstubAllGlobals();
});

describe("systemLocaleDefaults", () => {
  it("reads Sunday, 12-hour and month-first from en-US", () => {
    expect(systemLocaleDefaults("en-US")).toEqual({ weekStart: 0, hourCycle: "h12", dateOrder: "mdy" });
  });

  it("reads Monday, 24-hour and day-first from de-DE", () => {
    expect(systemLocaleDefaults("de-DE")).toEqual({ weekStart: 1, hourCycle: "h24", dateOrder: "dmy" });
  });
});

describe("localePrefs", () => {
  it("lets an override win while system still reports the locale", () => {
    setWeekStart(0);
    setHourCycle("h12");
    setDateOrder("dmy");
    const prefs = localePrefs();
    expect(prefs).toMatchObject({ weekStart: 0, hourCycle: "h12", dateOrder: "dmy" });
    expect(prefs.system).toEqual(systemLocaleDefaults());
  });

  it("hands React the effective values and the three setters", () => {
    setWeekStart(1);
    setHourCycle("h24");
    setDateOrder("dmy");
    const html = hookMarkup();
    expect(html).toContain('data-prefs="1|h24|dmy"');
    expect(html).toContain('data-setters="function,function,function"');
  });

  it("persists each override and clears it back to the system default with null", () => {
    setWeekStart(1);
    setHourCycle("h12");
    setDateOrder("dmy");
    expect(localStorage.getItem(WEEK_START_KEY)).toBe("1");
    expect(localStorage.getItem(HOUR_CYCLE_KEY)).toBe("h12");
    expect(localStorage.getItem(DATE_ORDER_KEY)).toBe("dmy");

    setWeekStart(null);
    expect(localStorage.getItem(WEEK_START_KEY)).toBeNull();
    expect(localePrefs().weekStart).toBe(localePrefs().system.weekStart);

    setDateOrder(null);
    expect(localStorage.getItem(DATE_ORDER_KEY)).toBeNull();
    expect(localePrefs().dateOrder).toBe(localePrefs().system.dateOrder);
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(WEEK_START_KEY, "tuesday");
    localStorage.setItem(HOUR_CYCLE_KEY, "25");
    localStorage.setItem(DATE_ORDER_KEY, "ymd");
    const prefs = localePrefs();
    expect(prefs).toMatchObject({
      weekStart: prefs.system.weekStart,
      hourCycle: prefs.system.hourCycle,
      dateOrder: prefs.system.dateOrder,
    });
    expect(prefs.overrides).toEqual({ weekStart: null, hourCycle: null, dateOrder: null });
  });

  it("keeps an override across a reload and falls back to the locale when it is cleared", async () => {
    setWeekStart(0);
    setHourCycle("h12");
    setDateOrder("dmy");

    // A reload = a fresh module instance over the same storage.
    vi.resetModules();
    const reloaded = await import("./locale");
    expect(reloaded.localePrefs()).toMatchObject({ weekStart: 0, hourCycle: "h12", dateOrder: "dmy" });

    // Clearing an override returns that preference to the system default, and nothing else moves.
    localStorage.removeItem(WEEK_START_KEY);
    vi.resetModules();
    const cleared = await import("./locale");
    const prefs = cleared.localePrefs();
    expect(prefs.overrides.weekStart).toBeNull();
    expect(prefs.weekStart).toBe(prefs.system.weekStart);
    expect(prefs.hourCycle).toBe("h12");
    expect(prefs.dateOrder).toBe("dmy");
  });
});

describe("startLocaleSync", () => {
  it("works without a window and returns a cleanup", () => {
    const stop = startLocaleSync();
    expect(typeof stop).toBe("function");
    stop();
  });
});
