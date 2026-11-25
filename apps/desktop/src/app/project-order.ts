/**
 * Sidebar project order: the `order` number on the project note's frontmatter, which
 * `host_projects` already sorts by (`crates/shards-host/src/tools.rs`, `cmp_rank`) and
 * `host_project_update { order }` writes. One algorithm for projects and tasks: the writes come
 * from `planReorder`, so a drag is a single midpoint number once the list is numbered.
 */
import { planReorder, type OrderWrite } from "@/components/task/model";

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface ProjectRank {
  id: string;
  title: string;
  order?: number | null;
  from_note?: boolean;
}

/** A row only a task names (no project note): the host lists it last and it can carry no order. */
const isGhost = (p: ProjectRank): boolean => p.from_note === false;

/**
 * The order the host shows: note-backed rows first, then ascending `order`, then the unranked
 * rows by title (lower-case) and id. Mirrors `cmp_rank` + the `from_note`/title/id tiebreaks in
 * `projects()` so the app and the CLI agree.
 */
export function orderProjects<T extends ProjectRank>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ga = isGhost(a);
    const gb = isGhost(b);
    if (ga !== gb) return ga ? 1 : -1;
    const oa = num(a.order);
    const ob = num(b.order);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa !== null && ob === null) return -1;
    if (oa === null && ob !== null) return 1;
    const ta = a.title.toLowerCase();
    const tb = b.title.toLowerCase();
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Writes that place `movedId` at `toIndex` of `shown` (the list as rendered, moved row included).
 * `shown` must already be in shown order — pass `orderProjects(rows)`.
 *
 * A row without a project note has no file to write `order` to, so it stays out of the plan: the
 * drop lands after the last note-backed row before the cursor, and a drag of a ghost row itself
 * writes nothing.
 */
export function planProjectOrder(shown: readonly ProjectRank[], movedId: string, toIndex: number): OrderWrite[] {
  const moved = shown.find((p) => p.id === movedId);
  if (!moved || isGhost(moved)) return [];
  const group = shown.filter((p) => p.id !== movedId && !isGhost(p)).map((p) => ({ id: p.id, order: num(p.order) }));
  // The drop's index counts note-backed rows only: a ghost before the cursor does not move it.
  const ghostsBefore = shown.slice(0, Math.max(0, toIndex)).filter(isGhost).length;
  return planReorder(group, movedId, Math.max(0, toIndex - ghostsBefore));
}
