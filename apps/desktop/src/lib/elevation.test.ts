/// <reference types="node" />
/**
 * Elevation guard (programme Slice A, item 2). Three named steps replace seven ad-hoc shadow
 * utilities, and no raw Tailwind shadow utility may remain in the app source.
 *
 * Exception: `src/app/QuickAddForm.tsx` is owned by issue #29 on another branch and must not be
 * touched here, so it keeps its one raw shadow utility until that lands. Every other file must
 * use an elevation token.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(join(SRC, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Files that cannot be edited in this slice (issue #29 is in flight on QuickAddForm). */
const OFF_LIMITS = new Set(["app/QuickAddForm.tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}

describe("elevation tokens", () => {
  it("defines three steps in both themes and exposes them as shadow utilities", () => {
    for (const n of [1, 2, 3]) {
      expect(CSS).toContain(`--elevation-${n}:`);
      expect(CSS).toContain(`--shadow-elevation-${n}: var(--elevation-${n});`);
    }
    expect(CSS).toMatch(/^\.dark \{[\s\S]*--elevation-3:/m);
  });

  it("leaves no raw shadow-xs/sm/md/lg/xl/2xl utility in src", () => {
    const bad = sourceFiles(SRC)
      .filter((f) => !OFF_LIMITS.has(relative(SRC, f)))
      .map((f) => ({ file: relative(SRC, f), hits: [...readFileSync(f, "utf8").matchAll(/shadow-(xs|sm|md|lg|xl|2xl)(?![\w-])/g)].map((m) => m[0]) }))
      .filter((v) => v.hits.length > 0)
      .map((v) => `${v.file}: ${[...new Set(v.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });

  it("has no bare shadow-xl utility left", () => {
    expect(CSS.includes("shadow-xl")).toBe(false);
  });
});
