/**
 * Wikilinks (`[[target]]`, `[[target|alias]]`) for rendered Markdown. A remark plugin turns
 * them into link nodes on mdast `text` nodes only, so code spans and fenced blocks stay literal.
 * Resolution happens at render time (id first, then case-insensitive title).
 */

export const WIKI_HREF_PREFIX = "#wiki:";

export interface WikiRef {
  target: string;
  alias: string | null;
}

const WIKI_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

/** Every wikilink in a plain string (no code awareness). */
export function parseWikilinks(text: string): WikiRef[] {
  const out: WikiRef[] = [];
  for (const m of text.matchAll(WIKI_RE)) out.push({ target: m[1].trim(), alias: m[2]?.trim() || null });
  return out;
}

/** Wikilinks in a Markdown body, skipping fenced code blocks and inline code. */
export function extractWikilinks(body: string | null | undefined): WikiRef[] {
  const out: WikiRef[] = [];
  let fence = false;
  for (const line of (body ?? "").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    out.push(...parseWikilinks(line.replace(/`[^`]*`/g, "")));
  }
  return out;
}

export const wikiHref = (target: string) => `${WIKI_HREF_PREFIX}${encodeURIComponent(target)}`;
export const wikiTargetFromHref = (href: string | undefined): string | null =>
  href?.startsWith(WIKI_HREF_PREFIX) ? decodeURIComponent(href.slice(WIKI_HREF_PREFIX.length)) : null;

/* ------------------------------------------------------------ resolution */

export type WikiKind = "note" | "task" | "memory" | "file";

export interface WikiResolved {
  kind: WikiKind;
  id: string;
  title?: string;
}

const ID_RE = /^([ntm])-[0-9A-Za-z]{2,}$/;
const KIND_BY_PREFIX: Record<string, WikiKind> = { n: "note", t: "task", m: "memory" };

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Resolve a target against known entities: an id prefix wins, then title, then title slug. */
export function resolveWikilink(target: string, entities: { id: string; title: string; type?: string }[]): WikiResolved | null {
  const t = target.trim();
  const byId = entities.find((e) => e.id === t);
  if (byId) return { kind: kindOf(byId), id: byId.id, title: byId.title };
  if (ID_RE.test(t)) return { kind: KIND_BY_PREFIX[t[0]], id: t };
  const lower = t.toLowerCase();
  const byTitle = entities.find((e) => e.title.toLowerCase() === lower);
  if (byTitle) return { kind: kindOf(byTitle), id: byTitle.id, title: byTitle.title };
  const slug = slugify(t);
  const bySlug = slug ? entities.find((e) => slugify(e.title) === slug) : undefined;
  if (bySlug) return { kind: kindOf(bySlug), id: bySlug.id, title: bySlug.title };
  // Obsidian heading / block links: `[[Note#Heading]]`, `[[Note#^block]]` open the note.
  const hash = t.indexOf("#");
  return hash > 0 ? resolveWikilink(t.slice(0, hash), entities) : null;
}

/** The notes-browser route of a file, by vault-relative or absolute path. */
export const fileRoute = (path: string) => `/notes?p=${encodeURIComponent(path)}`;

/** Id prefix of a browsed file entity (`host_notes_browse` row) in the resolver. */
export const FILE_ENTITY_PREFIX = "file:";

/**
 * Resolver entities for browsed files, Obsidian style: by title, by file name and by
 * vault-relative path without `.md`.
 */
export function fileEntities(files: { path: string; title: string }[]): { id: string; title: string; type: string }[] {
  const out: { id: string; title: string; type: string }[] = [];
  for (const f of files) {
    const id = `${FILE_ENTITY_PREFIX}${f.path}`;
    const noExt = f.path.replace(/\.md$/i, "");
    const name = noExt.slice(noExt.lastIndexOf("/") + 1);
    for (const title of new Set([f.title, name, noExt])) out.push({ id, title, type: "file" });
  }
  return out;
}

function kindOf(e: { id: string; type?: string }): WikiKind {
  if (e.type === "file") return "file";
  return KIND_BY_PREFIX[e.id[0]] ?? (e.type === "task" ? "task" : e.type === "memory" ? "memory" : "note");
}

/* ----------------------------------------------------------- remark plugin */

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

/** Split one text node's value into text + link nodes. */
export function splitWikiText(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKI_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: "text", value: value.slice(last, i) });
    const target = m[1].trim();
    const alias = m[2]?.trim();
    out.push({
      type: "link",
      url: wikiHref(target),
      title: null,
      data: { hProperties: { "data-wikilink": target } },
      children: [{ type: "text", value: alias || target }],
    });
    last = i + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node: MdNode) {
  if (!node.children) return;
  // Links already are links; code/inlineCode have no text children.
  if (node.type === "link" || node.type === "linkReference") return;
  const next: MdNode[] = [];
  let changed = false;
  for (const child of node.children) {
    if (child.type === "text" && child.value?.includes("[[")) {
      const parts = splitWikiText(child.value);
      if (parts.length !== 1 || parts[0].type !== "text") changed = true;
      next.push(...parts);
    } else {
      walk(child);
      next.push(child);
    }
  }
  if (changed) node.children = next;
}

/** remark plugin: `[[x]]` → link nodes with `#wiki:` hrefs. */
export function remarkWikilinks() {
  return (tree: MdNode) => walk(tree);
}

/* --------------------------------------------------------- bare entity ids */

/** `#id:` hrefs mark a bare id (`t-DPRR`) found in prose; the renderer checks it exists. */
export const ID_HREF_PREFIX = "#id:";
const BARE_ID_RE = /\b[tnm]-[0-9A-Z]{4,}\b/g;

export const idTargetFromHref = (href: string | undefined): string | null =>
  href?.startsWith(ID_HREF_PREFIX) ? href.slice(ID_HREF_PREFIX.length) : null;

/** Split one text node's value into text + `#id:` link nodes. */
export function splitIdText(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(BARE_ID_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: "text", value: value.slice(last, i) });
    out.push({ type: "link", url: `${ID_HREF_PREFIX}${m[0]}`, title: null, children: [{ type: "text", value: m[0] }] });
    last = i + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walkIds(node: MdNode) {
  if (!node.children) return;
  // Inside a link the text is already a link; code and inlineCode carry no text children.
  if (node.type === "link" || node.type === "linkReference") return;
  const next: MdNode[] = [];
  let changed = false;
  for (const child of node.children) {
    if (child.type === "text" && child.value && /[tnm]-[0-9A-Z]{4}/.test(child.value)) {
      const parts = splitIdText(child.value);
      if (parts.length !== 1 || parts[0].type !== "text") changed = true;
      next.push(...parts);
    } else {
      walkIds(child);
      next.push(child);
    }
  }
  if (changed) node.children = next;
}

/** remark plugin: bare `t-…`/`n-…`/`m-…` ids in prose → `#id:` link nodes. Run after wikilinks. */
export function remarkEntityIds() {
  return (tree: MdNode) => walkIds(tree);
}
