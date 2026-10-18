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

const render = (folder: string | null, tag: string | null) =>
  renderToStaticMarkup(
    <NotesTree
      folders={buildFolderTree(ROWS)}
      tags={buildTagTree(ROWS)}
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
    // A folder and a tag can be selected together (they combine with AND).
    expect(html).toMatch(/role="tree"[^>]*aria-multiselectable="true"|aria-multiselectable="true"[^>]*role="tree"/);
    const els = items(html);
    expect(els.map((e) => `${attr(e, "data-id")}@${attr(e, "aria-level")}`)).toEqual(["s:folders@1", "f:@2", "f:Projects@3", "s:tags@1", "t:project@2", "t:project/shards@3"]);
    expect(els.filter((e) => attr(e, "tabindex") === "0")).toHaveLength(1);
    expect(attr(els[2], "aria-expanded")).toBe("false");
    expect(attr(els[4], "aria-expanded")).toBe("true");
  });

  it("marks the selected folder and tag, and shows counts", () => {
    const els = items(render("Projects", "project/shards"));
    expect(els.filter((e) => attr(e, "aria-selected") === "true").map((e) => attr(e, "data-id"))).toEqual(["f:Projects", "t:project/shards"]);
    const html = render(null, null);
    expect(html).toMatch(/data-id="t:project"[\s\S]*?>3<\/span>/);
    expect(html).toMatch(/data-id="t:project\/shards"[\s\S]*?>2<\/span>/);
  });
});
