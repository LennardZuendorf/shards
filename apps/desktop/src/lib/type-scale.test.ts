/// <reference types="node" />
/**
 * Type scale (programme Slice A, item 4, decision D2: the floor is 12px). Seven named steps
 * replace 15 arbitrary pixel sizes in 201 places. Avatar initials keep one named token because
 * a 2-3 character glyph is the one place a smaller step is honest.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(join(SRC, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    // QuickAddForm.tsx is off-limits here (GitHub #29 is editing it on another branch).
    if (relative(SRC, p) === join("app", "QuickAddForm.tsx")) return [];
    return [p];
  });
}

describe("type tokens", () => {
  it.each([
    ["--text-micro", "0.75rem", "1rem"], // 12 / 16
    ["--text-small", "0.8125rem", "1.125rem"], // 13 / 18
    ["--text-body", "0.875rem", "1.25rem"], // 14 / 20
    ["--text-heading", "0.9375rem", "1.375rem"], // 15 / 22
    ["--text-title", "1.125rem", "1.625rem"], // 18 / 26
    ["--text-display", "1.5rem", "2rem"], // 24 / 32
    ["--text-avatar", "0.6875rem", "1"], // 11, initials only (pre-existing size; not smaller than before)
  ])("%s is %s / %s", (name, size, leading) => {
    expect(CSS).toContain(`${name}: ${size};`);
    expect(CSS).toContain(`${name}--line-height: ${leading};`);
  });

  it("leaves no arbitrary pixel text size in src", () => {
    const bad = sourceFiles(SRC)
      .map((f) => ({ file: relative(SRC, f), hits: [...readFileSync(f, "utf8").matchAll(/text-\[[0-9.]+px\]/g)].map((m) => m[0]) }))
      .filter((v) => v.hits.length > 0)
      .map((v) => `${v.file}: ${[...new Set(v.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });
});
