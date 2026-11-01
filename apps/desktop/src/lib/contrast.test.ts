/// <reference types="node" />
/** Verify occupied foreground/surface pairs across all Flint palettes, not the old ratios. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
type Rgb = [number, number, number];
const entry = new URL("../index.css", import.meta.url);
function cssSource(url: URL): string {
  return readFileSync(url, "utf8").replace(/@import "(\.\/[^";]+)";/g, (_all, relative: string) => cssSource(new URL(relative, url)));
}
const css = cssSource(entry).replace(/\/\*[\s\S]*?\*\//g, "");
function palette(stone: string, dark: boolean) {
  const active = new Set([":root", ...(dark ? [".dark"] : []), `:root[data-stone="${stone}"]`, ...(dark ? [`:root.dark[data-stone="${stone}"]`] : [])]);
  const vars = new Map<string, string>();
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1].trim().split(/,\s*/).some((selector) => active.has(selector.trim()))) continue;
    for (const pair of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(pair[1], pair[2].trim());
  }
  function resolve(key: string, depth = 0): string {
    if (depth > 12) throw new Error(`Token alias cycle: ${key}`);
    const value = vars.get(key);
    if (!value) throw new Error(`Missing token ${key} in ${stone}/${dark ? "dark" : "light"}`);
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    return alias ? resolve(alias[1], depth + 1) : value;
  }
  return resolve;
}
function oklchToSrgb(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => {
    const c = Math.min(Math.max(x, 0), 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}


function contrast(resolve: (key: string) => string, a: string, b: string) {
  const light = (token: string) => {
    const value = resolve(`--${token}`);
    const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
    if (!match) throw new Error(`Expected opaque token: ${token}=${value}`);
    return luminance(oklchToSrgb(Number(match[1]), Number(match[2]), Number(match[3])));
  };
  const x = light(a), y = light(b);
  return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
}
it("uses WCAG reference luminance", () => {
  expect(luminance(oklchToSrgb(1, 0, 0))).toBeCloseTo(1, 3);
  expect(luminance(oklchToSrgb(0, 0, 0))).toBeCloseTo(0, 3);
});
for (const stone of ["flint", "jade", "moonstone", "sandstone"]) {
  for (const dark of [false, true]) {
    describe(`${stone}/${dark ? "dark" : "light"}`, () => {
      const resolve = palette(stone, dark);
      for (const surface of ["sh-card", "sh-tray", "sh-raise", "sh-sheet", "sh-frame"]) {
        for (const text of ["foreground", "muted-foreground", "due-overdue", "status-working", "status-awaiting", "danger"]) {
          it(`${text} is readable on ${surface}`, () => expect(contrast(resolve, text, surface)).toBeGreaterThanOrEqual(4.5));
        }
        it(`focus and input are visible on ${surface}`, () => {
          expect(contrast(resolve, "ring", surface)).toBeGreaterThanOrEqual(3);
          expect(contrast(resolve, "input", surface)).toBeGreaterThanOrEqual(3);
        });
      }
      it("keeps inverted buttons and needs-you panels readable", () => {
        expect(contrast(resolve, "primary-foreground", "primary")).toBeGreaterThanOrEqual(4.5);
        expect(contrast(resolve, "sh-ember-fg", "sh-ember-bg")).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
}
