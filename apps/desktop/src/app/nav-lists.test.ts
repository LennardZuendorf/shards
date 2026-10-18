import { describe, expect, it } from "vitest";
import { navRoutes } from "@/lib/ui-contract";
import { GO_ROUTES, PALETTE_ROUTES, SIDEBAR_FOOTER, SIDEBAR_SECTIONS, SIDEBAR_TOP } from "./nav-lists";

/** The lists AppShell (g chords), CommandPalette (Go to) and Sidebar actually render from. */
describe("the real nav consumers follow navRoutes()", () => {
  const nav = navRoutes();
  it("g chords: nav order then settings, no search (`/` binds it)", () => {
    expect(GO_ROUTES).toEqual([...nav, "settings"]);
  });
  it("palette Go to: search, nav order, settings", () => {
    expect(PALETTE_ROUTES).toEqual(["search", ...nav, "settings"]);
  });
  it("sidebar: search on top, the sections in order, settings in the footer", () => {
    expect(SIDEBAR_TOP).toEqual(["search"]);
    expect(SIDEBAR_SECTIONS.flatMap((s) => s.routes)).toEqual(nav);
    expect(SIDEBAR_FOOTER).toEqual(["settings"]);
  });
});
