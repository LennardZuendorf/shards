/// <reference types="node" />
/**
 * WCAG AA contrast table for the shipped tokens (.spec/design.md § Colors, desktop-app/35).
 *
 * Reads `:root` and `.dark` from src/index.css, resolves `var()` aliases (`.dark` falls back to
 * `:root`, as on <html>), converts OKLCH → linear sRGB → gamut-clipped sRGB → WCAG 2.x relative
 * luminance (the math of research-b's scripts/contrast.py), and pins every kept pair: text ≥ 4.5:1,
 * rings and dots ≥ 3:1. The `ratio` column pins today's values (±0.02) so a token change shows up
 * here as a reviewed diff, not as a silent drift.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Theme = "light" | "dark";
type Rgb = [number, number, number];

const CSS = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Map<string, string> {
  const m = new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m").exec(CSS);
  if (!m) throw new Error(`${selector} block missing from index.css`);
  const vars = new Map<string, string>();
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  return vars;
}

const ROOT = block(":root");
const DARK = block(".dark");

function resolve(name: string, theme: Theme, depth = 0): string {
  if (depth > 8) throw new Error(`alias loop at ${name}`);
  const raw = (theme === "dark" ? DARK.get(name) : undefined) ?? ROOT.get(name);
  if (raw === undefined) throw new Error(`--${name.slice(2)} is not defined for ${theme}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(raw);
  return alias ? resolve(alias[1], theme, depth + 1) : raw;
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

function color(token: string, theme: Theme): Rgb {
  const value = resolve(`--${token}`, theme);
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (!m) throw new Error(`--${token} (${theme}) is not an opaque oklch(): ${value}`);
  return oklchToSrgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: string, bg: string, theme: Theme): number {
  const [a, b] = [luminance(color(fg, theme)), luminance(color(bg, theme))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("contrast math", () => {
  it("matches WCAG reference points", () => {
    expect(luminance(oklchToSrgb(1, 0, 0))).toBeCloseTo(1, 3);
    expect(luminance(oklchToSrgb(0, 0, 0))).toBeCloseTo(0, 6);
    // research-b § 3: fg/bg 19.79 light, 18.96 dark.
    expect(ratio("foreground", "background", "light")).toBeCloseTo(19.79, 1);
    expect(ratio("foreground", "background", "dark")).toBeCloseTo(18.96, 1);
  });
});

/** [fg token, bg token, theme, minimum, pinned ratio]. */
type Row = [string, string, Theme, 4.5 | 3, number];
const TEXT = 4.5;
const NON_TEXT = 3;

// Surfaces a text token sits on: content, navigation, hover/selected row.
const SURFACES = ["background", "sidebar", "accent"] as const;

const SEMANTIC_TEXT: Record<Theme, Record<string, [number, number, number]>> = {
  light: {
    "priority-urgent": [6.42, 6.15, 5.89],
    "priority-high": [5.23, 5.01, 4.79],
    "priority-normal": [5.26, 5.03, 4.82],
    "priority-low": [5.51, 5.28, 5.05],
    "due-overdue": [6.42, 6.15, 5.89],
    "due-today": [7.09, 6.79, 6.5],
    "due-tomorrow": [19.79, 18.96, 18.16],
    "due-later": [5.51, 5.28, 5.05],
    "status-queued": [5.51, 5.28, 5.05],
    "status-working": [5.26, 5.03, 4.82],
    "status-awaiting": [5.05, 4.84, 4.63],
    "status-done": [7.09, 6.79, 6.5],
    "status-error": [6.42, 6.15, 5.89],
    destructive: [6.42, 6.15, 5.89],
    // Quick-add token text (lib/quickadd/token-tone.ts): dates `text-info`, deadline `text-danger`.
    info: [5.26, 5.03, 4.82],
    danger: [6.42, 6.15, 5.89],
    "muted-foreground": [5.51, 5.28, 5.05],
    foreground: [19.79, 18.96, 18.16],
  },
  dark: {
    "priority-urgent": [6.84, 6.19, 5.23],
    "priority-high": [8.32, 7.53, 6.35],
    "priority-normal": [7.51, 6.79, 5.73],
    "priority-low": [7.63, 6.91, 5.83],
    "due-overdue": [6.84, 6.19, 5.23],
    "due-today": [8.9, 8.06, 6.8],
    "due-tomorrow": [18.96, 17.16, 14.47],
    "due-later": [7.63, 6.91, 5.83],
    "status-queued": [7.63, 6.91, 5.83],
    "status-working": [7.51, 6.79, 5.73],
    "status-awaiting": [11.53, 10.43, 8.8],
    "status-done": [8.9, 8.06, 6.8],
    "status-error": [6.84, 6.19, 5.23],
    destructive: [6.84, 6.19, 5.23],
    info: [7.51, 6.79, 5.73],
    danger: [6.84, 6.19, 5.23],
    "muted-foreground": [7.63, 6.91, 5.83],
    foreground: [18.96, 17.16, 14.47],
  },
};

const ROWS: Row[] = [
  ...(["light", "dark"] as const).flatMap((theme) =>
    Object.entries(SEMANTIC_TEXT[theme]).flatMap(([fg, pins]) =>
      SURFACES.map((bg, i): Row => [fg, bg, theme, TEXT, pins[i]]),
    ),
  ),
  // Buttons, chips, popovers, avatars.
  ["primary-foreground", "primary", "light", TEXT, 17.16],
  ["primary-foreground", "primary", "dark", TEXT, 14.22],
  ["sidebar-primary-foreground", "sidebar-primary", "light", TEXT, 17.16],
  ["sidebar-primary-foreground", "sidebar-primary", "dark", TEXT, 14.22],
  ["muted-foreground", "secondary", "light", TEXT, 5.05],
  ["muted-foreground", "secondary", "dark", TEXT, 5.83],
  ["accent-foreground", "accent", "light", TEXT, 16.42],
  ["accent-foreground", "accent", "dark", TEXT, 14.47],
  ["popover-foreground", "popover", "light", TEXT, 19.79],
  ["popover-foreground", "popover", "dark", TEXT, 17.16],
  ["foreground", "identity-human-fill", "light", TEXT, 15.72],
  ["foreground", "identity-human-fill", "dark", TEXT, 9.95],
  ["primary-foreground", "identity-agent-fill", "light", TEXT, 17.16],
  ["primary-foreground", "identity-agent-fill", "dark", TEXT, 14.22],
  // Focus ring at full opacity (rings, dots, icons: 3:1).
  ["ring", "background", "light", NON_TEXT, 4.74],
  ["ring", "sidebar", "light", NON_TEXT, 4.54],
  ["ring", "accent", "light", NON_TEXT, 4.35],
  ["ring", "background", "dark", NON_TEXT, 4.18],
  ["ring", "sidebar", "dark", NON_TEXT, 3.78],
  ["ring", "accent", "dark", NON_TEXT, 3.19],
];

describe("token contrast (WCAG AA)", () => {
  it.each(ROWS)("%s on %s (%s) ≥ %s:1", (fg, bg, theme, min, pinned) => {
    const r = ratio(fg, bg, theme);
    expect(r).toBeGreaterThanOrEqual(min);
    expect(Math.abs(r - pinned), `pinned ${pinned}, got ${r.toFixed(2)}`).toBeLessThanOrEqual(0.02);
  });
});
