/** Pure folder and tag trees for the notes browser (R42). */
import type { NoteFile } from "@/lib/types";
import type { TreeNode } from "@/lib/ui-contract";

export interface TreeSelection {
  /** A folder and everything below it; `""` = the notes root only; `null` = any. */
  folder: string | null;
  /** A tag or any descendant tag (`a` matches `a/b`); `null` = any. */
  tag: string | null;
}

interface Building {
  node: TreeNode;
  kids: Map<string, Building>;
  /** Index of the last file counted here: a file counts once per node, however many paths reach it. */
  last: number;
}

const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, "en");

function finish(b: Building): TreeNode {
  b.node.children = [...b.kids.values()].map(finish).sort(byName);
  return b.node;
}

/** One tree from `/`-separated paths per file; empty segments are dropped. */
function build(rows: NoteFile[], pathsOf: (f: NoteFile) => string[], countRoot: (f: NoteFile) => boolean): TreeNode {
  const root: Building = { node: { key: "", name: "", count: 0, children: [] }, kids: new Map(), last: -1 };
  rows.forEach((f, i) => {
    if (countRoot(f)) root.node.count++;
    for (const p of pathsOf(f)) {
      let at = root;
      let key = "";
      for (const seg of p.split("/")) {
        if (!seg) continue;
        key = key ? `${key}/${seg}` : seg;
        let next = at.kids.get(seg);
        if (!next) {
          next = { node: { key, name: seg, count: 0, children: [] }, kids: new Map(), last: -1 };
          at.kids.set(seg, next);
        }
        if (next.last !== i) {
          next.last = i;
          next.node.count++;
        }
        at = next;
      }
    }
  });
  return finish(root);
}

/** The real folder hierarchy; the root (`""`) counts every file. */
export function buildFolderTree(rows: NoteFile[]): TreeNode {
  return build(
    rows,
    (f) => (f.folder ? [f.folder] : []),
    () => true,
  );
}

/** Virtual tag hierarchy: `a/b/c` nests under `a` and `a/b`; the root counts tagged files. */
export function buildTagTree(rows: NoteFile[]): TreeNode {
  return build(
    rows,
    (f) => f.tags,
    (f) => f.tags.some((t) => t.split("/").some(Boolean)),
  );
}

const under = (value: string, key: string) => value === key || value.startsWith(`${key}/`);

/** A tag as its tree node key: empty `/` segments dropped. */
const tagKey = (t: string) => (t.startsWith("/") || t.endsWith("/") || t.includes("//") ? t.split("/").filter(Boolean).join("/") : t);

/** Folder and tag selections combine with AND. */
export function matchesTree(row: NoteFile, sel: TreeSelection): boolean {
  if (sel.folder !== null && (sel.folder === "" ? row.folder !== "" : !under(row.folder, sel.folder))) return false;
  if (sel.tag !== null && !row.tags.some((t) => under(tagKey(t), sel.tag as string))) return false;
  return true;
}

/* ---------------------------------------------------------------- keyboard model (WAI-ARIA tree) */

/**
 * One visible row of the combined tree. Ids carry a kind prefix so a folder and a tag with the
 * same path stay apart in the persisted expanded list: `s:folders` / `s:tags` are the section
 * headers, `f:<key>` folders (`f:` = All files), `t:<key>` tags.
 */
export interface FlatItem {
  id: string;
  label: string;
  level: number;
  parent: string | null;
  hasChildren: boolean;
  count?: number;
}

/** The tree column itself (shown beside the list); kept in the same persisted list, never a row. */
export const TREE_COLUMN = "c:tree";

/** The column, both sections and All files open on first use. */
export const DEFAULT_EXPANDED: readonly string[] = [TREE_COLUMN, "s:folders", "f:", "s:tags"];

/** Visible rows in order: Folders › All files › folders, then Tags › tags (when any file has one). */
export function flattenTree(folders: TreeNode, tags: TreeNode, expanded: ReadonlySet<string>): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (n: TreeNode, prefix: string, level: number, parent: string, label = n.name) => {
    const id = prefix + n.key;
    out.push({ id, label, level, parent, hasChildren: n.children.length > 0, count: n.count });
    if (expanded.has(id)) for (const c of n.children) walk(c, prefix, level + 1, id);
  };
  out.push({ id: "s:folders", label: "Folders", level: 1, parent: null, hasChildren: true });
  if (expanded.has("s:folders")) walk(folders, "f:", 2, "s:folders", "All files");
  if (tags.children.length) {
    out.push({ id: "s:tags", label: "Tags", level: 1, parent: null, hasChildren: true });
    if (expanded.has("s:tags")) for (const c of tags.children) walk(c, "t:", 2, "s:tags");
  }
  return out;
}

export type TreeAction = { focus?: string; expand?: string; collapse?: string; select?: string };

/** What a key does on the focused row; `null` = not a tree key (let it through). */
export function treeKeyAction(items: FlatItem[], focusId: string, key: string, expanded: ReadonlySet<string>): TreeAction | null {
  const i = Math.max(0, items.findIndex((x) => x.id === focusId));
  const cur = items[i];
  if (!cur) return null;
  const open = cur.hasChildren && expanded.has(cur.id);
  switch (key) {
    case "ArrowDown":
      return { focus: items[Math.min(items.length - 1, i + 1)].id };
    case "ArrowUp":
      return { focus: items[Math.max(0, i - 1)].id };
    case "Home":
      return { focus: items[0].id };
    case "End":
      return { focus: items[items.length - 1].id };
    case "ArrowRight":
      if (!cur.hasChildren) return {};
      return open ? (items[i + 1]?.parent === cur.id ? { focus: items[i + 1].id } : {}) : { expand: cur.id };
    case "ArrowLeft":
      if (open) return { collapse: cur.id };
      return cur.parent ? { focus: cur.parent } : {};
    case "Enter":
    case " ":
      return { select: cur.id };
    default:
      return null;
  }
}

/** The next row whose label starts with `buffer`, wrapping; a one-letter buffer starts after the focus. */
export function typeAhead(items: FlatItem[], focusId: string, buffer: string): string | null {
  const q = buffer.toLowerCase();
  const n = items.length;
  const at = Math.max(0, items.findIndex((x) => x.id === focusId));
  const start = q.length === 1 ? at + 1 : at;
  for (let k = 0; k < n; k++) {
    const it = items[(start + k) % n];
    if (it.label.toLowerCase().startsWith(q)) return it.id;
  }
  return null;
}

/** Ancestor ids of a row id, nearest first. */
function ancestors(id: string): string[] {
  const kind = id.slice(0, 2);
  if (kind === "s:") return [];
  const key = id.slice(2);
  const out: string[] = [];
  const parts = key ? key.split("/") : [];
  for (let k = parts.length - 1; k >= 1; k--) out.push(kind + parts.slice(0, k).join("/"));
  if (kind === "f:") {
    if (key) out.push("f:");
    out.push("s:folders");
  } else out.push("s:tags");
  return out;
}

/** The focus id if visible, else its nearest visible ancestor, else the first row. */
export function visibleFocus(items: FlatItem[], focusId: string | null): string | null {
  if (!items.length) return null;
  const has = (id: string) => items.some((x) => x.id === id);
  if (focusId) for (const id of [focusId, ...ancestors(focusId)]) if (has(id)) return id;
  return items[0].id;
}

/** The filter after selecting a row; selecting the active node clears it. `null` = a section header. */
export function selectNode(id: string, sel: TreeSelection): TreeSelection | null {
  if (id.startsWith("f:")) {
    const folder = id.slice(2) || null;
    return { ...sel, folder: sel.folder === folder ? null : folder };
  }
  if (id.startsWith("t:")) {
    const tag = id.slice(2);
    return { ...sel, tag: sel.tag === tag ? null : tag };
  }
  return null;
}
