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
}

/**
 * The order the host shows: ascending `order`, then the unranked rows by title (lower-case) and
 * id. Mirrors `cmp_rank` + the title/id tiebreak in `projects()` so the app and the CLI agree.
 */
export function orderProjects<T extends ProjectRank>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
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
 */
export function planProjectOrder(shown: readonly ProjectRank[], movedId: string, toIndex: number): OrderWrite[] {
  const group = shown.filter((p) => p.id !== movedId).map((p) => ({ id: p.id, order: num(p.order) }));
  return planReorder(group, movedId, toIndex);
}
