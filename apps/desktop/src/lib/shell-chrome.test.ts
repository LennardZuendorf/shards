/// <reference types="node" />
/**
 * Shell chrome diet (programme Slice A, item 8). Deletions only, so this pins the absence of the
 * duplicated chrome and the presence of everything the a11y runner waits for.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SHELL = read("../app/AppShell.tsx");
const SIDEBAR = read("../app/Sidebar.tsx");
const PALETTE = read("../app/CommandPalette.tsx");

describe("header", () => {
  it("is a plain h-10 strip with no duplicate capture button or separator", () => {
    // The region hairline stays until the spec adopts tone-first separation (design.md:115).
    expect(SHELL).toContain('"titlebar-drag flex h-10 shrink-0 items-center gap-2 border-b px-3"');
    expect(SHELL).not.toContain("bg-background/85");
    expect(SHELL).not.toContain("backdrop-blur");
    expect(SHELL).not.toContain('aria-label="Add task"');
    expect(SHELL).not.toContain("Separator");
  });

  it("keeps the breadcrumb landmark and the one h1", () => {
    expect(SHELL).toContain('aria-label="Breadcrumb"');
    expect(SHELL).toContain("<h1");
    expect(SHELL).toContain("HEADER_ACTIONS_ID");
  });
});

describe("sidebar", () => {
  it("drops the duplicate search icon", () => {
    expect(SIDEBAR).not.toContain('aria-label="Search"');
  });

  it("keeps hiding counts on hover so they cannot collide with the row action", () => {
    expect(SIDEBAR).toContain("group-hover/menu-item:opacity-0");
    expect(SIDEBAR).toContain("group-focus-within/menu-item:opacity-0");
  });
});

describe("command palette", () => {
  it("has no keycap legend footer and keeps its pinned dialog name", () => {
    expect(PALETTE).not.toContain("border-t px-3 py-2");
    expect(PALETTE).toContain('title="Command menu"');
  });
});
