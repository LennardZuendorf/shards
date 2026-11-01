/// <reference types="node" />
/**
 * Copy rules (programme Slice A, item 10). One "not saved" warning, so the wording lives in one
 * place and is testable.
 *
 * The stale-spelling sweep is scoped to `src/lib`. The remaining call sites live in component
 * files the Flint redesign owns (`components/scratch/ScratchViewer.tsx`,
 * `components/shared/open-in.ts`, `components/task/GettingStarted.tsx`,
 * `components/task/actions.ts`, `components/task/DeleteTaskConfirm.tsx`,
 * `views/memories/MemoriesView.tsx`, `views/scratch/ScratchView.tsx`); this salvage must not
 * edit them, so the full-src sweep stays on `ui/visual-slice-a` where the copy rollout lands.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { notSaved } from "./copy";

/** The `src/lib` tree: the only surface this salvage owns. */
const SRC = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}
const ALL = sourceFiles(SRC).map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("notSaved", () => {
  it("names the dropped fields and one reason", () => {
    expect(notSaved(["recur"])).toBe("Not saved: recur. This vault’s core is older than the app.");
    expect(notSaved(["due", "labels"])).toContain("due, labels");
  });
});

describe("no stale spelling survives in src/lib", () => {
  it.each(["Copied path", "Copied body", "Copied to the clipboard", "not supported by this vault's core yet"])(
    "does not contain %s",
    (needle) => {
      expect(ALL.filter((f) => f.text.includes(needle)).map((f) => f.file)).toEqual([]);
    },
  );
});
