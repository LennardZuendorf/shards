/// <reference types="node" />
/**
 * Row and group-header state language (programme Slice A, item 7). One fill for hover, one for
 * selected/picked, no per-row hairline, and a sticky translucent group band.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("task row", () => {
  const row = read("../components/task/TaskRow.tsx");

  it("uses the row tones for hover and selection", () => {
    expect(row).toContain("hover:bg-row-hover");
    expect(row).toContain("bg-row-selected");
    expect(row).not.toContain("bg-accent before:absolute");
  });

  it("drops the list-row hairline but keeps the board card border", () => {
    expect(row).not.toContain("border-b border-border/70");
    expect(row).toContain("rounded-lg border bg-card px-3 py-2.5");
  });
});

describe("group header", () => {
  const list = read("../components/task/TaskList.tsx");

  it("is sticky, translucent and borderless", () => {
    expect(list).toContain("sticky top-0 z-10");
    expect(list).toContain("bg-background/85");
    expect(list).not.toContain("border-b border-border/80");
  });

  it("renders the count as a muted dot-N and makes the header one button", () => {
    expect(list).toContain("· {count}");
    expect(list).toMatch(/<button[\s\S]{0,400}aria-expanded=\{!collapsed\}/);
  });
});
