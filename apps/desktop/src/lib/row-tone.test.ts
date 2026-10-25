/// <reference types="node" />
/**
 * Row tone scale (programme Slice A, item 6). Hover, selected and the legacy `accent` must be
 * three different tones, and the retired tokens must be gone.
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
const ROOT = block(":root");
const DARK = block(".dark");

describe("surface tones", () => {
  it.each([
    ["--surface-2", "oklch(0.98 0 0)"],
    ["--surface-3", "oklch(0.965 0 0)"],
  ])("light %s is %s", (name, value) => {
    expect(ROOT.get(name)).toBe(value);
  });

  it.each([
    ["--surface-2", "oklch(0.23 0 0)"],
    ["--surface-3", "oklch(0.269 0 0)"],
  ])("dark %s is %s", (name, value) => {
    expect(DARK.get(name)).toBe(value);
  });

  it("keeps hover and selected distinct, and selected is the deeper step in both themes", () => {
    const L = (v: string | undefined) => Number(/oklch\(([\d.]+)/.exec(v ?? "")?.[1]);
    expect(ROOT.get("--surface-2")).not.toBe(ROOT.get("--surface-3"));
    expect(ROOT.get("--surface-3")).not.toBe(ROOT.get("--accent"));
    // light: deeper = darker; dark: deeper (more emphasis) = lighter
    expect(L(ROOT.get("--surface-3"))).toBeLessThan(L(ROOT.get("--surface-2")));
    expect(L(DARK.get("--surface-3"))).toBeGreaterThan(L(DARK.get("--surface-2")));
  });

  it("aliases the row states to the new scale", () => {
    expect(ROOT.get("--row-hover")).toBe("var(--surface-2)");
    expect(ROOT.get("--row-selected")).toBe("var(--surface-3)");
  });

  it("retires the dead tokens", () => {
    // `--due-week` stays: its remaining call sites live in QuickAddForm.tsx (issue #29) and task/pickers.tsx
    // (src/app/QuickAddForm.tsx, issue #29). Everything else here has no live call sites.
    for (const dead of ["--brand:", "--brand-soft:", "--primary-soft:", "--surface-header:", "--identity-human:", "--identity-agent:"]) {
      expect(CSS.includes(dead)).toBe(false);
    }
    expect(CSS.includes("--color-brand:")).toBe(false);
    expect(CSS.includes("--color-surface-header:")).toBe(false);
  });
});
