import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const boot = readFileSync(new URL("../../public/theme-boot.js", import.meta.url), "utf8");

function firstPaint(values: Record<string, string>, systemDark = false, blocked = false) {
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  const root = {
    classList: { add: (v: string) => classes.add(v), toggle: (v: string, on: boolean) => on ? classes.add(v) : classes.delete(v) },
    setAttribute: (k: string, v: string) => attributes.set(k, v),
    removeAttribute: (k: string) => attributes.delete(k),
    style: { colorScheme: "" },
  };
  runInNewContext(boot, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: { getItem: (key: string) => { if (blocked) throw new Error("blocked"); return values[key] ?? null; } },
  });
  return { dark: classes.has("dark"), stone: attributes.get("data-stone"), scheme: root.style.colorScheme };
}

describe("appearance before first paint", () => {
  for (const stone of ["flint", "jade", "moonstone", "sandstone"]) {
    for (const mode of ["light", "dark"]) {
      it(`restores ${stone} in ${mode} without depending on system appearance`, () => {
        expect(firstPaint({ "shards-theme": mode, "shards-stone": stone }, mode === "light")).toEqual({
          dark: mode === "dark", stone, scheme: mode,
        });
      });
    }
  }
  it("keeps the stone while system mode follows the operating system", () => {
    expect(firstPaint({ "shards-stone": "jade" }, true)).toEqual({ dark: true, stone: "jade", scheme: "dark" });
    expect(firstPaint({ "shards-theme": "system", "shards-stone": "jade" }, false)).toEqual({ dark: false, stone: "jade", scheme: "light" });
  });
  it("rejects malformed stones and handles denied storage", () => {
    expect(firstPaint({ "shards-stone": "jade evil", "shards-theme": "invalid" }, true)).toEqual({ dark: true, stone: "flint", scheme: "dark" });
    expect(firstPaint({}, false, true)).toEqual({ dark: false, stone: "flint", scheme: "light" });
  });
});
