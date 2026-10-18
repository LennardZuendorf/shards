import { describe, expect, it } from "vitest";
import type { NoteFile } from "@/lib/types";
import { filterFiles } from "./filter";

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
  it("filters by folder (with subfolders), root and tag", () => {
    const paths = (f: Parameters<typeof filterFiles>[1]) => filterFiles(FILES, f).map((r) => r.file.path);
    expect(paths({ text: "", folder: "Daily", tag: null })).toEqual(["Daily/2026/standup.md", "Daily/retro.md"]);
    expect(paths({ text: "", folder: "", tag: null })).toEqual(["index.md"]);
    expect(paths({ text: "", folder: null, tag: "team" })).toEqual(["Daily/retro.md"]);
  });

  it("filters by a tag and its descendant tags (R42)", () => {
    const files = [file("a.md", { tags: ["project"] }), file("b.md", { tags: ["project/shards/ui"] }), file("c.md", { tags: ["projects"] })];
    expect(filterFiles(files, { text: "", folder: null, tag: "project" }).map((r) => r.file.path)).toEqual(["a.md", "b.md"]);
  });

  it("combines folder, tag and text with AND", () => {
    const files = [
      file("Team/People/ana.md", { tags: ["people/team"] }),
      file("Team/People/bob.md", { tags: ["people/team"] }),
      file("Team/ana-notes.md", { tags: ["people/team"] }),
      file("Other/ana.md", { tags: ["people/team"] }),
      file("Team/People/ana-old.md", { tags: ["archive"] }),
    ];
    expect(filterFiles(files, { text: "ana", folder: "Team/People", tag: "people" }).map((r) => r.file.path)).toEqual(["Team/People/ana.md"]);
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
