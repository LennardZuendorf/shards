import { describe, expect, it } from "vitest";
import { readCollapsed, readSidebarOpen, shellRoutes, toggleCollapsed, writeSidebarOpen, type KV } from "./nav";
import { PREF_KEYS, navRoutes } from "./ui-contract";

/** In-memory Storage fake; `fail` simulates blocked storage. */
function store(init: Record<string, string> = {}, fail = false): KV & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => {
      if (fail) throw new Error("blocked");
      return k in data ? data[k] : null;
    },
    setItem: (k, v) => {
      if (fail) throw new Error("blocked");
      data[k] = v;
    },
  };
}

describe("shellRoutes", () => {
  it("frames navRoutes() with search first and settings last", () => {
    expect(shellRoutes()).toEqual(["search", ...navRoutes(), "settings"]);
  });
});

describe("collapsed sections", () => {
  it("defaults to nothing collapsed", () => {
    expect(readCollapsed(store())).toEqual([]);
  });

  it("persists a toggle under PREF_KEYS.navCollapsed and survives a reload", () => {
    const s = store();
    expect(toggleCollapsed("agents", s)).toEqual(["agents"]);
    expect(s.data[PREF_KEYS.navCollapsed]).toBe('["agents"]');
    expect(readCollapsed(s)).toEqual(["agents"]);
    expect(toggleCollapsed("agents", s)).toEqual([]);
  });

  it("ignores corrupt or unknown stored values", () => {
    expect(readCollapsed(store({ [PREF_KEYS.navCollapsed]: "{nope" }))).toEqual([]);
    expect(readCollapsed(store({ [PREF_KEYS.navCollapsed]: '["agents","bogus",3]' }))).toEqual(["agents"]);
    expect(readCollapsed(store({ [PREF_KEYS.navCollapsed]: '"agents"' }))).toEqual([]);
  });

  it("tolerates blocked storage", () => {
    const s = store({}, true);
    expect(readCollapsed(s)).toEqual([]);
    expect(toggleCollapsed("library", s)).toEqual(["library"]);
  });
});

describe("sidebar open state", () => {
  it("defaults to open", () => {
    expect(readSidebarOpen(store())).toBe(true);
    expect(readSidebarOpen(store({}, true))).toBe(true);
  });

  it("round-trips closed under PREF_KEYS.sidebarOpen", () => {
    const s = store();
    writeSidebarOpen(false, s);
    expect(s.data[PREF_KEYS.sidebarOpen]).toBe("0");
    expect(readSidebarOpen(s)).toBe(false);
    writeSidebarOpen(true, s);
    expect(readSidebarOpen(s)).toBe(true);
  });
});
