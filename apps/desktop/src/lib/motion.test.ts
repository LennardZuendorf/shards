/// <reference types="node" />
/**
 * Reduced-motion guard (desktop-app/35, tech.md § "Reduced motion guard").
 *
 * `<MotionConfig reducedMotion="user">` skips only positional keys and layout projection; it does
 * not stop `filter: blur(…)`, a raw `transform` string with `rotateX`/`rotateY`, or a `layoutId`
 * shared-layout slide when a call site opts in. Every use of one of those in the vendored
 * animate-ui tree must sit under a ternary on a `useReducedMotion()` variable (per use, not per
 * file). A re-install that drops the patch turns this red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../components/animate-ui", import.meta.url));

const RISKY: { name: string; re: RegExp }[] = [
  { name: "filter", re: /\bfilter\s*:/ },
  // `rotateAxis` is the variable the dialogs interpolate into `transform`; its definition line
  // (`const rotateAxis = … 'rotateX' …`) only names the axis and animates nothing.
  { name: "rotateX/rotateY", re: /\brotate[XY]\b|\$\{rotateAxis\}/ },
  { name: "layoutId", re: /\blayoutId\s*[=:]/ },
];
const AXIS_DEFINITION = /\bconst\s+rotateAxis\s*=/;
/** Lines scanned back from a risky literal for its reduced-motion ternary condition. */
const WINDOW = 6;

/** Variables bound to `useReducedMotion()` (e.g. `reduceMotion`). */
function reducedVars(source: string): string[] {
  const hookImported = /import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*["'](?:motion\/react|framer-motion)["']/.test(source);
  if (!hookImported) return [];
  return [...source.matchAll(/\bconst\s+(\w+)\s*=\s*useReducedMotion\s*\(/g)].map((m) => m[1]);
}

/**
 * Every risky literal, per occurrence, must sit under a ternary whose condition names a
 * reduced-motion variable: `reduce ? … : { filter … }`, within WINDOW lines before it (or one
 * line after, for `layoutId={\n cond ? … }`). A file-level import or an unrelated call is not
 * enough: reverting one patch among several in a file turns this red.
 * Returns `name@line` per unguarded occurrence.
 */
function violations(source: string): string[] {
  const vars = reducedVars(source);
  const lines = source.split("\n");
  const guard = vars.length ? new RegExp(`(?:^|[^\\w.])!?(?:${vars.join("|")})\\s*\\?`) : null;
  const out: string[] = [];
  lines.forEach((line, i) => {
    for (const r of RISKY) {
      if (!r.re.test(line)) continue;
      if (r.name === "rotateX/rotateY" && AXIS_DEFINITION.test(line)) continue;
      const window = lines.slice(Math.max(0, i - WINDOW), i + 2).join("\n");
      if (!guard || !guard.test(window)) out.push(`${r.name}@${i + 1}`);
    }
  });
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

describe("reduced-motion checker", () => {
  it("flags filter, 3D rotation and layoutId without a reduced-motion ternary", () => {
    expect(violations(`<motion.div initial={{ opacity: 0, filter: 'blur(4px)' }} />`)).toEqual(["filter@1"]);
    expect(violations("const axis = isVertical ? 'rotateX' : 'rotateY';")).toEqual(["rotateX/rotateY@1"]);
    expect(violations("<motion.div layoutId={`bg-${id}`} />")).toEqual(["layoutId@1"]);
  });

  it("flags an import without a call, and a call without the import", () => {
    expect(violations(`import { useReducedMotion } from 'motion/react';\nconst f = { filter: 'blur(4px)' };`)).toEqual(["filter@2"]);
    expect(violations(`const r = useReducedMotion();\nconst f = r ? {} : { filter: 'blur(4px)' };`)).toEqual(["filter@2"]);
  });

  it("flags one unguarded literal in a file that guards another (the per-use rule)", () => {
    const src = `import { useReducedMotion } from 'motion/react';
const reduce = useReducedMotion();
const a = <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }} />;
${"// filler\n".repeat(12)}const b = <motion.div initial={{ opacity: 0, filter: 'blur(4px)' }} />;`;
    expect(violations(src)).toEqual(["filter@16"]);
  });

  it("passes a patched source and ignores array .filter calls", () => {
    const patched = `import { motion, useReducedMotion } from 'motion/react';
      const reduce = useReducedMotion();
      <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }} />
      <motion.div layoutId={
        withTransition && !reduce ? 'x' : undefined
      } />`;
    expect(violations(patched)).toEqual([]);
    expect(violations("const keys = Object.keys(a).filter((k) => k !== 'children');")).toEqual([]);
    expect(violations("<motion.div animate={{ opacity: 1, scale: 1 }} />")).toEqual([]);
  });
});

describe("vendored animate-ui tree", () => {
  const files = sourceFiles(ROOT);

  it("scans the real components/animate-ui tree", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("guards every filter, 3D rotation and layoutId use with a reduced-motion ternary", () => {
    const bad = files
      .map((f) => ({ file: relative(ROOT, f), found: violations(readFileSync(f, "utf8")) }))
      .filter((v) => v.found.length > 0)
      .map((v) => `${v.file}: ${v.found.join(", ")}`);
    expect(bad).toEqual([]);
  });
});
