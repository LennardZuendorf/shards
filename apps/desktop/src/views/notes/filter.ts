/** Pure filtering for the read-only notes browser. */
import type { NoteFile } from "@/lib/types";

export interface FileFilter {
  text: string;
  /** Exact folder, or a folder and everything below it. `""` = the notes root only. */
  folder: string | null;
  tag: string | null;
}

export interface FileRow {
  file: NoteFile;
  /** Body-search snippet when only the body matched. */
  snippet?: string;
}

/** Every folder with the number of files at or below it, sorted by path. */
export function folderCounts(files: NoteFile[]): [string, number][] {
  const c = new Map<string, number>();
  for (const f of files) {
    if (!f.folder) continue;
    const parts = f.folder.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const k = parts.slice(0, i).join("/");
      c.set(k, (c.get(k) ?? 0) + 1);
    }
  }
  return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], "en"));
}

export function tagCounts(files: NoteFile[]): [string, number][] {
  const c = new Map<string, number>();
  for (const f of files) for (const t of f.tags) c.set(t, (c.get(t) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
}

const inFolder = (f: NoteFile, folder: string) => (folder === "" ? f.folder === "" : f.folder === folder || f.folder.startsWith(`${folder}/`));

/**
 * Title and path matches first, then tag matches, then body hits (from search, keyed by
 * vault-relative or absolute path); input order (newest first) within each rank.
 */
export function filterFiles(files: NoteFile[], f: FileFilter, bodyHits: Map<string, string | undefined> = new Map()): FileRow[] {
  const t = f.text.trim().toLowerCase();
  const rows: { row: FileRow; rank: number }[] = [];
  for (const file of files) {
    if (f.folder !== null && !inFolder(file, f.folder)) continue;
    if (f.tag && !file.tags.includes(f.tag)) continue;
    if (!t) {
      rows.push({ row: { file }, rank: 0 });
      continue;
    }
    if (file.title.toLowerCase().includes(t) || file.path.toLowerCase().includes(t) || file.id?.toLowerCase() === t) {
      rows.push({ row: { file }, rank: 0 });
    } else if (file.tags.some((x) => x.toLowerCase().includes(t))) {
      rows.push({ row: { file }, rank: 1 });
    } else if (bodyHits.has(file.path) || bodyHits.has(file.abs_path)) {
      rows.push({ row: { file, snippet: bodyHits.get(file.path) ?? bodyHits.get(file.abs_path) }, rank: 2 });
    }
  }
  return rows.sort((a, b) => a.rank - b.rank).map((r) => r.row);
}
