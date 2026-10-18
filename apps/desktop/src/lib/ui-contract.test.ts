import { describe, expect, it } from "vitest";
import { ROUTE_PATTERNS } from "./router";
import { DEFAULT_VIEW_OPTIONS, NAV_SECTIONS, PREF_KEYS, navRoutes, viewOptionsKey } from "./ui-contract";

describe("NAV_SECTIONS", () => {
  it("orders the three spaces Tasks, Agent team, Library", () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(["tasks", "agents", "library"]);
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(["Tasks", "Agent team", "Library"]);
  });

  it("places every built destination in its space, in R1 order", () => {
    expect(NAV_SECTIONS[0].routes).toEqual(["inbox", "today", "upcoming"]);
    expect(NAV_SECTIONS[1].routes).toEqual(["agents", "memories", "scratch"]);
    expect(NAV_SECTIONS[2].routes).toEqual(["notes"]);
  });

  it("names only real routes, each once", () => {
    const known = new Set(ROUTE_PATTERNS.map(([n]) => n));
    const all = navRoutes();
    expect(all.every((r) => known.has(r))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps search and settings out of the sections", () => {
    expect(navRoutes()).not.toContain("search");
    expect(navRoutes()).not.toContain("settings");
  });
});

describe("viewOptionsKey", () => {
  it("prefixes the view id", () => {
    expect(viewOptionsKey("today")).toBe("shards.view.today");
    expect(viewOptionsKey("project:n-abc")).toBe("shards.view.project:n-abc");
  });
});

describe("defaults and keys", () => {
  it("defaults view options to today's behaviour", () => {
    expect(DEFAULT_VIEW_OPTIONS).toEqual({ group: "default", sort: "manual", dir: "asc", density: "comfortable", filters: {} });
  });

  it("namespaces every preference key under shards.", () => {
    expect(Object.values(PREF_KEYS).every((k) => k.startsWith("shards."))).toBe(true);
  });
});
