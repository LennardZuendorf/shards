/** Pure filtering for the read-only notes browser. */
import type { NoteFile } from "@/lib/types";
import { matchesTree, type TreeSelection } from "./tree";

/** Tree selection (folder and tag, see `matchesTree`) AND a text filter. */
export interface FileFilter extends TreeSelection {
  text: string;
}

export interface FileRow {
  file: NoteFile;
  /** Body-search snippet when only the body matched. */
  snippet?: string;
}

/**
 * Title and path matches first, then tag matches, then body hits (from search, keyed by
 * vault-relative or absolute path); input order (newest first) within each rank.
 */
export function filterFiles(files: NoteFile[], f: FileFilter, bodyHits: Map<string, string | undefined> = new Map()): FileRow[] {
  const t = f.text.trim().toLowerCase();
  const rows: { row: FileRow; rank: number }[] = [];
  for (const file of files) {
    if (!matchesTree(file, f)) continue;
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
