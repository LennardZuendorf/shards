/// <reference types="node" />
/**
 * Copy rules (programme Slice A, item 10). Six spellings of "Copied" and two contradictory
 * "Not saved" strings collapse to one of each.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copied, notSaved } from "./copy";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}
const ALL = sourceFiles(SRC).map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("copied", () => {
  it("is bare for a bare action and named for a payload", () => {
    expect(copied()).toBe("Copied");
    expect(copied("path")).toBe("Copied the path");
    expect(copied("id")).toBe("Copied the id");
  });
});

describe("notSaved", () => {
  it("names the dropped fields and one reason", () => {
    expect(notSaved(["recur"])).toBe("Not saved: recur. This vault’s core is older than the app.");
    expect(notSaved(["due", "labels"])).toContain("due, labels");
  });
});

describe("no stale spelling survives in src", () => {
  it.each(["Copied path", "Copied body", "Copied to the clipboard", "not supported by this vault's core yet"])(
    "does not contain %s",
    (needle) => {
      expect(ALL.filter((f) => f.text.includes(needle)).map((f) => f.file)).toEqual([]);
    },
  );

  it("does not leak a raw tool name into user-facing text", () => {
    const leaks = ALL.filter((f) => /"(?:It needs |[^"\n]*\b)host_task_delete|shards_memory_new|shards_scratch_set/.test(f.text) && /toast|EmptyState|description=|DialogTitle|<code/.test(f.text)).map((f) => f.file);
    expect(leaks).toEqual([]);
  });

  it("spells subtask without a hyphen", () => {
    expect(ALL.filter((f) => f.text.includes("sub-task")).map((f) => f.file)).toEqual([]);
  });
});
