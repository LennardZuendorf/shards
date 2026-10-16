import { describe, expect, it } from "vitest";
import type { NoteFile } from "@/lib/types";
import { filterFiles, folderCounts, tagCounts } from "./filter";

const file = (path: string, extra: Partial<NoteFile> = {}): NoteFile => {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, abs_path: `/v/${path}`, folder, title, id: null, tags: [], modified: null, ...extra };
};

const FILES = [
  file("Daily/2026/standup.md"),
  file("Daily/retro.md", { tags: ["team"] }),
  file("Projects/Launch plan.md", { id: "n-1ABC" }),
  file("index.md"),
];

describe("notes browser filter", () => {
  it("counts folders at every depth", () => {
    expect(folderCounts(FILES)).toEqual([
      ["Daily", 2],
      ["Daily/2026", 1],
      ["Projects", 1],
    ]);
    expect(tagCounts(FILES)).toEqual([["team", 1]]);
  });

  it("filters by folder (with subfolders), root and tag", () => {
    const paths = (f: Parameters<typeof filterFiles>[1]) => filterFiles(FILES, f).map((r) => r.file.path);
    expect(paths({ text: "", folder: "Daily", tag: null })).toEqual(["Daily/2026/standup.md", "Daily/retro.md"]);
    expect(paths({ text: "", folder: "", tag: null })).toEqual(["index.md"]);
    expect(paths({ text: "", folder: null, tag: "team" })).toEqual(["Daily/retro.md"]);
  });

  it("ranks title/path over tag over body hits", () => {
    const hits = new Map([["/v/index.md", "…launch party…"]]);
    const rows = filterFiles([...FILES, file("Misc/notes.md", { tags: ["launch"] })], { text: "launch", folder: null, tag: null }, hits);
    expect(rows.map((r) => r.file.path)).toEqual(["Projects/Launch plan.md", "Misc/notes.md", "index.md"]);
    expect(rows[2].snippet).toBe("…launch party…");
  });

  it("matches a Shards id exactly", () => {
    expect(filterFiles(FILES, { text: "n-1abc", folder: null, tag: null }).map((r) => r.file.path)).toEqual(["Projects/Launch plan.md"]);
  });
});
