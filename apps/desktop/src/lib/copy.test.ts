/// <reference types="node" />
/**
 * Shared clipboard and warning copy, with a source-wide guard against the superseded wording.
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
  it.each([undefined, null, ""])("uses the bare confirmation for %s", (noun) => {
    expect(copied(noun)).toBe("Copied");
  });

  it.each(["path", "body", "id", "wikilink"])("names the copied %s", (noun) => {
    expect(copied(noun)).toBe(`Copied the ${noun}`);
  });
});

describe("notSaved", () => {
  it("names the dropped fields and one reason", () => {
    expect(notSaved(["recur"])).toBe("Not saved: recur. This vault’s core is older than the app.");
    expect(notSaved(["due", "labels"])).toContain("due, labels");
  });
});

describe("no stale spelling survives in src", () => {
  it.each([
    "Copied path", "Copied body", "Copied to the clipboard",
    "not supported by this vault's core yet", "this vault’s core is too old",
    "It needs host_task_delete.", "shards_memory_new</code>", "shards_scratch_set</code>",
    "sub-task", "New project", "New memory", "New scratchpad",
  ])(
    "does not contain %s",
    (needle) => {
      expect(ALL.filter((f) => f.text.includes(needle)).map((f) => f.file)).toEqual([]);
    },
  );
});
