import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NoteFile } from "@/lib/types";
import { NotesTree } from "./NotesTree";
import { buildFolderTree, buildTagTree, DEFAULT_EXPANDED } from "./tree";

const file = (path: string, tags: string[] = []): NoteFile => {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return { path, abs_path: `/v/${path}`, folder, title: path, id: null, tags, modified: null };
};

const ROWS = [file("Projects/launch/a.md", ["project/shards"]), file("Projects/b.md", ["project/shards/ui"]), file("c.md", ["project"])];

const render = (folder: string | null, tag: string | null, mode: "folders" | "tags" = "folders", rows = ROWS) =>
  renderToStaticMarkup(
    <NotesTree
      mode={mode}
      onModeChange={() => {}}
      folders={buildFolderTree(rows)}
      tags={buildTagTree(rows)}
      expanded={new Set([...DEFAULT_EXPANDED, "t:project"])}
      onExpandedChange={() => {}}
      selection={{ folder, tag }}
      onSelect={() => {}}
    />,
  );

const items = (html: string) => [...html.matchAll(/<div[^>]*role="treeitem"[^>]*>/g)].map((m) => m[0]);
const attr = (el: string, name: string) => el.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("NotesTree", () => {
  it("exposes one tree with levels, expanded state and a single tab stop", () => {
    const html = render(null, null);
    expect(html.match(/role="tree"/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Browse notes by"');
    const els = items(html);
    expect(els.map((e) => `${attr(e, "data-id")}@${attr(e, "aria-level")}`)).toEqual(["f:@1", "f:Projects@2"]);
    expect(els.filter((e) => attr(e, "tabindex") === "0")).toHaveLength(1);
    expect(attr(els[1], "aria-expanded")).toBe("false");
  });

  it("marks the selected folder and tag, and shows counts", () => {
    const els = [...items(render("Projects", "project/shards")), ...items(render("Projects", "project/shards", "tags"))];
    expect(els.filter((e) => attr(e, "aria-selected") === "true").map((e) => attr(e, "data-id"))).toEqual(["f:Projects", "t:project/shards"]);
    const html = render(null, null, "tags");
    expect(html).toMatch(/data-id="t:project"[\s\S]*?>3<\/span>/);
    expect(html).toMatch(/data-id="t:project\/shards"[\s\S]*?>2<\/span>/);
  });

  it("keeps the Tags tab available when there are no tags", () => {
    const html = render(null, null, "tags", [file("root.md")]);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain("No tags yet.");
    expect(items(html)).toEqual([]);
  });
});
