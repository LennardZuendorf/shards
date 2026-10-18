/**
 * Section list + order of a project, stored in the project note's frontmatter (`sections:`)
 * through `host_project_update`, so agents, the CLI and every device see the same list.
 *
 * No browser storage. Where no note can hold the list (the Inbox, or a host without
 * `host_project_update`), sections come from task values only, and a section the viewer adds
 * that no task uses yet lives in memory until a task lands in it (or the view closes).
 */
import { useMemo, useState } from "react";
import { useProjectMetaSupported, useProjects } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { usePatchMany } from "./actions";
import { useUpdateProject } from "./project-actions";

export interface SectionStore {
  /** Every section in display order (stored order, then ones only seen on tasks). */
  sections: string[];
  /** True when the list lives in the vault (project note), false when it is task-derived. */
  persisted: boolean;
  setOrder: (next: string[]) => void;
  /** Rename a section on every task (host batch when persisted) and in the list. */
  rename: (from: string, to: string) => void;
  /** Drop a section: its tasks keep their place in the project, without a section. */
  remove: (name: string) => void;
  /**
   * Pin the order on screen before a task write that could change it. Without a stored list
   * the order is derived from the tasks, so dropping a card at the top of a column would move
   * the column. Call it before the drop's patch, while `sections` is still the shown order.
   */
  ensurePersisted: () => void;
}

/** The stored list to write so `shown` stays the order, or `null` when it already is. */
export function pinnedOrder(stored: readonly string[], shown: readonly string[]): string[] | null {
  const list = clean(shown);
  if (!list.length) return null;
  const head = clean(stored);
  if (list.every((s) => head.includes(s)) && head.length >= list.length) return null;
  return list;
}

const NONE: string[] = [];

function clean(list: readonly string[]): string[] {
  return [...new Set(list.map((x) => x.trim()).filter(Boolean))];
}

export function useSectionStore(project: string | null, tasks: readonly Task[]): SectionStore {
  const supported = useProjectMetaSupported();
  const projects = useProjects();
  const meta = project ? (projects.data?.find((p) => p.id === project) ?? null) : null;
  const persisted = supported && !!meta;
  const update = useUpdateProject();
  const patchMany = usePatchMany();
  // In-memory list for the task-derived case, keyed by project so switching views resets it.
  const [draft, setDraft] = useState<{ key: string | null; list: string[] }>({ key: project, list: [] });
  const local = draft.key === project ? draft.list : NONE;

  const stored = useMemo(() => (persisted ? (meta?.sections ?? []) : local), [persisted, meta, local]);
  const sections = useMemo(() => {
    const out = [...stored];
    for (const t of tasks) if (t.section && !out.includes(t.section)) out.push(t.section);
    return out;
  }, [stored, tasks]);

  const setOrder = (next: string[]) => {
    const list = clean(next);
    if (persisted && project) update.mutate({ id: project, set: { sections: list } });
    else setDraft({ key: project, list });
  };

  const viaTasks = (from: string, to: string | null) => {
    const items = tasks.filter((t) => (t.section ?? "") === from).map((t) => ({ task: t, args: { section: to } }));
    if (items.length) patchMany.mutate(items);
  };

  const rename = (from: string, to: string) => {
    const name = to.trim();
    if (!name || name === from) return;
    if (persisted && project) {
      update.mutate({ id: project, set: { sections: sections.map((x) => (x === from ? name : x)), renames: { [from]: name } } });
      return;
    }
    viaTasks(from, name);
    setDraft({ key: project, list: clean(sections.map((x) => (x === from ? name : x))) });
  };

  const remove = (name: string) => {
    if (persisted && project) {
      update.mutate({ id: project, set: { sections: sections.filter((x) => x !== name), renames: { [name]: "" } } });
      return;
    }
    viaTasks(name, null);
    setDraft({ key: project, list: sections.filter((x) => x !== name) });
  };

  const ensurePersisted = () => {
    // The host lists stored sections first and then ones placed by task order; only the
    // stored part is stable, so compare against it when the host reports it.
    const held = persisted ? (meta?.stored_sections ?? stored) : stored;
    const next = pinnedOrder(held, sections);
    if (!next) return;
    if (persisted && project) update.mutate({ id: project, set: { sections: next } });
    else setDraft({ key: project, list: next });
  };

  return { sections, persisted, setOrder, rename, remove, ensurePersisted };
}
