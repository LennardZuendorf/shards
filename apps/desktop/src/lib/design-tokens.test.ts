/// <reference types="node" />
/**
 * Design-token pins (programme Slice A, item 1). The spec names literal radii
 * (design.md radii sm 4 / md 6 / lg 8 / xl 12), a 248px sidebar (desktop-app/design.md:75) and a
 * 40% scrim (design.md:118); this pins all three so they cannot drift back.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const CSS = read("../index.css").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Map<string, string> {
  const m = new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m").exec(CSS);
  if (!m) throw new Error(`${selector} block missing from index.css`);
  const vars = new Map<string, string>();
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  return vars;
}

// The radii are Tailwind theme tokens, so they live in `@theme inline`; the scrim is a plain
// variable on `:root` / `.dark`.
const THEME = block("@theme inline");
const ROOT = block(":root");
const DARK = block(".dark");

describe("radius tokens are literal spec steps", () => {
  it.each([
    ["--radius-sm", "4px"],
    ["--radius-md", "6px"],
    ["--radius-lg", "8px"],
    ["--radius-xl", "12px"],
  ])("%s is %s", (name, value) => {
    expect(THEME.get(name)).toBe(value);
  });
});

describe("sidebar width", () => {
  it("SIDEBAR_WIDTH is 248px", () => {
    expect(read("../components/ui/sidebar.tsx")).toContain('const SIDEBAR_WIDTH = "15.5rem"');
  });
});

describe("overlay scrim", () => {
  it("is 40% in light and stronger in dark", () => {
    expect(ROOT.get("--scrim")).toBe("oklch(0.2 0 0 / 0.4)");
    expect(DARK.get("--scrim")).toBe("oklch(0 0 0 / 0.55)");
  });
  it.each(["dialog", "sheet", "alert-dialog"])("%s overlay uses bg-(--scrim)", (name) => {
    const src = read(`../components/ui/${name}.tsx`);
    expect(src).toContain("bg-(--scrim)");
    expect(src).not.toContain("bg-black/10");
  });
});
