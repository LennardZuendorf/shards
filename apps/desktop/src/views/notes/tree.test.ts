import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/lib/ui-contract";
import type { NoteFile } from "@/lib/types";
import { filterFiles } from "./filter";
import { buildFolderTree, buildTagTree, DEFAULT_EXPANDED, flattenTree, TREE_COLUMN, matchesTree, selectNode, treeKeyAction, typeAhead, visibleFocus, type FlatItem } from "./tree";

const file = (path: string, tags: string[] = []): NoteFile => {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, abs_path: `/v/${path}`, folder, title, id: null, tags, modified: null };
};

/** `key=count` per node, depth-first, for compact assertions. */
const flat = (n: TreeNode): string[] => [`${n.key}=${n.count}`, ...n.children.flatMap(flat)];

describe("buildTagTree", () => {
  it("nests a/b/c under a and a/b and counts files at or below each node", () => {
    const root = buildTagTree([file("1.md", ["project/shards"]), file("2.md", ["project/shards/ui"]), file("3.md", ["project"])]);
    expect(root.key).toBe("");
    expect(flat(root)).toEqual(["=3", "project=3", "project/shards=2", "project/shards/ui=1"]);
    const ui = root.children[0].children[0].children[0];
    expect(ui.name).toBe("ui");
  });

  it("counts a file once under a parent even with several descendant tags", () => {
    const root = buildTagTree([file("1.md", ["a/b", "a/c"])]);
    expect(flat(root)).toEqual(["=1", "a=1", "a/b=1", "a/c=1"]);
  });

  it("sorts children by name, ignores empty segments and untagged files", () => {
    const root = buildTagTree([file("1.md", ["zeta", "Alpha", "beta"]), file("2.md", ["/x//y/"]), file("3.md")]);
    expect(root.children.map((c) => c.key)).toEqual(["Alpha", "beta", "x", "zeta"]);
    expect(root.count).toBe(2);
    expect(flat(root.children[2])).toEqual(["x=1", "x/y=1"]);
  });
});

describe("buildFolderTree", () => {
  it("builds the real folder hierarchy; the root counts every file", () => {
    const root = buildFolderTree([file("Daily/2026/standup.md"), file("Daily/retro.md"), file("Projects/launch/plan.md"), file("index.md")]);
    expect(root.key).toBe("");
    expect(flat(root)).toEqual(["=4", "Daily=2", "Daily/2026=1", "Projects=1", "Projects/launch=1"]);
    expect(root.children[1].children[0].name).toBe("launch");
  });
});

describe("matchesTree", () => {
  const f = file("Team & Organization/People/ana.md", ["people/team", "x"]);

  it("matches a folder on `/` boundaries, including subfolders", () => {
    expect(matchesTree(f, { folder: "Team & Organization", tag: null })).toBe(true);
    expect(matchesTree(f, { folder: "Team & Organization/People", tag: null })).toBe(true);
    expect(matchesTree(f, { folder: "Team", tag: null })).toBe(false);
    expect(matchesTree(f, { folder: null, tag: null })).toBe(true);
  });

  it("keeps `\"\"` as the notes root only", () => {
    expect(matchesTree(f, { folder: "", tag: null })).toBe(false);
    expect(matchesTree(file("index.md"), { folder: "", tag: null })).toBe(true);
  });

  it("matches a tag or any descendant tag, not a sibling prefix", () => {
    expect(matchesTree(f, { folder: null, tag: "people" })).toBe(true);
    expect(matchesTree(f, { folder: null, tag: "people/team" })).toBe(true);
    expect(matchesTree(f, { folder: null, tag: "people/te" })).toBe(false);
    expect(matchesTree(f, { folder: null, tag: "peop" })).toBe(false);
  });

  it("matches a tag with stray slashes under the node it builds", () => {
    expect(matchesTree(file("1.md", ["/x//y/"]), { folder: null, tag: "x/y" })).toBe(true);
  });

  it("combines folder and tag with AND", () => {
    expect(matchesTree(f, { folder: "Team & Organization", tag: "people" })).toBe(true);
    expect(matchesTree(f, { folder: "Team & Organization", tag: "project" })).toBe(false);
    expect(matchesTree(f, { folder: "Daily", tag: "people" })).toBe(false);
  });
});

/** 1,000 rows: folders up to 3 deep, 0–4 nested tags each (deterministic). */
function syntheticRows(n = 1000): NoteFile[] {
  const tops = ["Daily", "Projects", "Team & Organization", "Areas", "Archive", "Inbox"];
  const tagRoots = ["project", "people", "area", "status", "topic"];
  return Array.from({ length: n }, (_, i) => {
    const depth = i % 4;
    const parts = [tops[i % tops.length], `sub${i % 7}`, `leaf${i % 11}`].slice(0, depth);
    const tags = Array.from({ length: i % 5 }, (_, j) => `${tagRoots[(i + j) % tagRoots.length]}/t${(i * 7 + j) % 13}/u${j}`);
    return file(`${parts.length ? `${parts.join("/")}/` : ""}note-${i}.md`, tags);
  });
}

describe("trees performance pin (tech.md § Performance Budget)", () => {
  it("builds both trees for 1,000 rows in ≤ 8 ms (min of 10 runs after a warm-up)", () => {
    const rows = syntheticRows();
    const run = () => {
      const t0 = performance.now();
      buildFolderTree(rows);
      buildTagTree(rows);
      return performance.now() - t0;
    };
    run();
    const times = Array.from({ length: 10 }, run);
    const min = Math.min(...times);
    expect(min, `build ms: ${times.map((t) => t.toFixed(2)).join(", ")}`).toBeLessThanOrEqual(8);
  });

  it("filters 1,000 rows by folder + tag + text in ≤ 4 ms (min of 10 runs after a warm-up)", () => {
    const rows = syntheticRows();
    const run = () => {
      const t0 = performance.now();
      filterFiles(rows, { text: "note-1", folder: "Projects", tag: "project" });
      return performance.now() - t0;
    };
    run();
    const times = Array.from({ length: 10 }, run);
    const min = Math.min(...times);
    expect(min, `filter ms: ${times.map((t) => t.toFixed(2)).join(", ")}`).toBeLessThanOrEqual(4);
  });
});

describe("tree keyboard model", () => {
  const rows = [
    file("Team & Organization/People/ana.md", ["project/shards/ui"]),
    file("Team & Organization/Leads/bo.md", ["project"]),
    file("Daily/d.md", ["people"]),
  ];
  const folders = buildFolderTree(rows);
  const tags = buildTagTree(rows);
  const items = (expanded: readonly string[]) => flattenTree(folders, tags, new Set(expanded));
  const ids = (xs: FlatItem[]) => xs.map((x) => `${x.id}@${x.level}`);

  it("flattens visible nodes with sections, levels and the All files root", () => {
    expect(ids(items(DEFAULT_EXPANDED))).toEqual(["s:folders@1", "f:@2", "f:Daily@3", "f:Team & Organization@3", "s:tags@1", "t:people@2", "t:project@2"]);
    expect(ids(items([...DEFAULT_EXPANDED, "f:Team & Organization", "t:project"]))).toEqual([
      "s:folders@1",
      "f:@2",
      "f:Daily@3",
      "f:Team & Organization@3",
      "f:Team & Organization/Leads@4",
      "f:Team & Organization/People@4",
      "s:tags@1",
      "t:people@2",
      "t:project@2",
      "t:project/shards@3",
    ]);
    const all = items(DEFAULT_EXPANDED);
    expect(all[1]).toMatchObject({ label: "All files", count: 3, hasChildren: true, parent: "s:folders" });
    expect(all.find((x) => x.id === "t:people")).toMatchObject({ hasChildren: false, parent: "s:tags" });
  });

  it("keeps the tree column open by default; its id is no tree row", () => {
    expect(DEFAULT_EXPANDED).toContain(TREE_COLUMN);
    expect(items(DEFAULT_EXPANDED).some((x) => x.id === TREE_COLUMN)).toBe(false);
  });

  it("omits the Tags section when no file has a tag", () => {
    expect(ids(flattenTree(buildFolderTree([file("a.md")]), buildTagTree([file("a.md")]), new Set(DEFAULT_EXPANDED)))).toEqual(["s:folders@1", "f:@2"]);
  });

  it("walks the scenario: → expands, ↓ moves to the child, Enter selects it", () => {
    let expanded = new Set(DEFAULT_EXPANDED);
    const team = "f:Team & Organization";
    expect(treeKeyAction(items([...expanded]), team, "ArrowRight", expanded)).toEqual({ expand: team });
    expanded = new Set([...expanded, team]);
    expect(treeKeyAction(items([...expanded]), team, "ArrowDown", expanded)).toEqual({ focus: "f:Team & Organization/Leads" });
    expect(treeKeyAction(items([...expanded]), team, "ArrowRight", expanded)).toEqual({ focus: "f:Team & Organization/Leads" });
    expect(treeKeyAction(items([...expanded]), "f:Team & Organization/People", "Enter", expanded)).toEqual({ select: "f:Team & Organization/People" });
  });

  it("← collapses an open node, else moves to the parent; ↑/↓ stop at the ends; Home/End jump", () => {
    const expanded = new Set(DEFAULT_EXPANDED);
    const xs = items([...expanded]);
    expect(treeKeyAction(xs, "f:", "ArrowLeft", expanded)).toEqual({ collapse: "f:" });
    expect(treeKeyAction(xs, "f:Daily", "ArrowLeft", expanded)).toEqual({ focus: "f:" });
    expect(treeKeyAction(xs, "s:folders", "ArrowLeft", expanded)).toEqual({ collapse: "s:folders" });
    expect(treeKeyAction(xs, "s:folders", "ArrowUp", expanded)).toEqual({ focus: "s:folders" });
    expect(treeKeyAction(xs, "t:project", "ArrowDown", expanded)).toEqual({ focus: "t:project" });
    expect(treeKeyAction(xs, "f:Daily", "Home", expanded)).toEqual({ focus: "s:folders" });
    expect(treeKeyAction(xs, "f:Daily", "End", expanded)).toEqual({ focus: "t:project" });
    expect(treeKeyAction(xs, "t:people", "ArrowRight", expanded)).toEqual({});
    expect(treeKeyAction(xs, "f:Daily", "Tab", expanded)).toBeNull();
  });

  it("type-ahead finds the next node by name prefix, wrapping, and cycles a repeated letter", () => {
    const xs = items(DEFAULT_EXPANDED);
    expect(typeAhead(xs, "s:folders", "te")).toBe("f:Team & Organization");
    expect(typeAhead(xs, "f:Team & Organization", "t")).toBe("s:tags");
    expect(typeAhead(xs, "s:tags", "t")).toBe("f:Team & Organization");
    expect(typeAhead(xs, "f:", "pro")).toBe("t:project");
    expect(typeAhead(xs, "f:", "zzz")).toBeNull();
  });

  it("keeps focus on the nearest visible ancestor when its node is hidden", () => {
    const xs = items(DEFAULT_EXPANDED);
    expect(visibleFocus(xs, "f:Team & Organization/People")).toBe("f:Team & Organization");
    expect(visibleFocus(items(["s:tags"]), "f:Daily")).toBe("s:folders");
    expect(visibleFocus(xs, "t:project/shards/ui")).toBe("t:project");
    expect(visibleFocus(xs, null)).toBe("s:folders");
    expect(visibleFocus([], "f:")).toBeNull();
  });

  it("maps a selected node onto the filter; selecting the active node clears it", () => {
    const none = { folder: null, tag: null };
    expect(selectNode("f:Daily", none)).toEqual({ folder: "Daily", tag: null });
    expect(selectNode("f:", { folder: "Daily", tag: "x" })).toEqual({ folder: null, tag: "x" });
    expect(selectNode("t:project", { folder: "Daily", tag: "people" })).toEqual({ folder: "Daily", tag: "project" });
    expect(selectNode("t:project", { folder: null, tag: "project" })).toEqual(none);
    expect(selectNode("f:Daily", { folder: "Daily", tag: null })).toEqual(none);
    expect(selectNode("s:tags", none)).toBeNull();
  });
});
