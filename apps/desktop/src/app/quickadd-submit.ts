/**
 * The pure seam between a parsed quick-add phrase and the `shards_task_new` payload.
 *
 * Kept out of `QuickAddForm.tsx` so the mapping (phrase + context defaults + per-field UI
 * overrides + members/projects) can be unit tested without a DOM.
 */
import type { TaskNewArgs } from "@/lib/api/tasks";
import { parseQuickAdd, type NameKind, type ParsedTask } from "@/lib/quickadd/parse";
import { resolveOwner } from "@/lib/quickadd/resolve";
import type { Member, Priority, Project } from "@/lib/types";
import type { QuickAddDefaults } from "./quickadd-store";

export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function resolveProject(name: string | null, projects: Project[]): Project | null {
  if (!name) return null;
  const n = norm(name);
  return (
    projects.find((p) => p.id === name) ??
    projects.find((p) => (p.slug ? norm(p.slug) === n : false)) ??
    projects.find((p) => norm(p.title) === n) ??
    projects.find((p) => norm(p.title).startsWith(n)) ??
    null
  );
}

export interface Overrides {
  due?: string | null;
  priority?: Priority | null;
  project?: string | null;
}

export interface QuickAddSubmitInput {
  text: string;
  /**
   * The component's own memoised parse, when it has one. Supplying it keeps the payload on the
   * same clock as the chips: re-parsing at submit time would date a task from a form left open
   * across midnight differently from the date the user is looking at.
   */
  parsed?: ParsedTask;
  /** Same `known` map the component builds from projects/members/labels/sections. */
  known: Partial<Record<NameKind, readonly string[]>>;
  over: Overrides;
  droppedLabels?: string[];
  defaults: QuickAddDefaults;
  projects: Project[];
  members: Member[];
  description?: string;
  now?: Date;
}

export interface QuickAddSubmitResult {
  ok: boolean;
  title: string;
  args: TaskNewArgs | null;
  warnings: string[];
  blocked: { status: "unknown" | "ambiguous"; raw: string } | null;
}

export function resolveQuickAddSubmit(input: QuickAddSubmitInput): QuickAddSubmitResult {
  const { text, known, over, droppedLabels = [], defaults, projects, members, description, now } = input;

  const parsed = input.parsed ?? parseQuickAdd(text, { known, now });
  const title = parsed.title.trim();
  if (!title) return { ok: false, title: "", args: null, warnings: [], blocked: null };

  const parsedProject = resolveProject(parsed.project, projects);
  const projectId = over.project !== undefined ? over.project : (parsedProject?.id ?? defaults.project ?? null);
  const project = projectId
    ? (projects.find((p) => p.id === projectId) ?? { id: projectId, title: projectId, sections: [], open_count: 0 })
    : null;
  const due = over.due !== undefined ? over.due : (parsed.due ?? defaults.due ?? null);
  const priority = over.priority !== undefined ? over.priority : (parsed.priority ?? defaults.priority ?? null);
  const labels = [...new Set([...(defaults.labels ?? []), ...parsed.labels])].filter(
    (l) => !droppedLabels.includes(l),
  );
  const ownerRaw = parsed.owner ?? defaults.owner ?? null;
  const ownerRes = resolveOwner(ownerRaw, members);
  const owner = ownerRes.status === "resolved" ? ownerRes.member : null;
  if (ownerRes.status !== "none" && ownerRes.status !== "resolved") {
    return {
      ok: false,
      title,
      args: null,
      warnings: [],
      blocked: { status: ownerRes.status, raw: ownerRes.raw },
    };
  }
  const section = parsed.section ?? defaults.section ?? null;

  const warnings: string[] = [];
  if (parsed.project && !parsedProject && over.project === undefined) {
    warnings.push(`No project “${parsed.project}” — added to ${project ? project.title : "Inbox"}.`);
  }

  const args: TaskNewArgs = {
    title,
    priority: priority ?? undefined,
    tags: labels.length ? labels : undefined,
    owner: owner?.id ?? undefined,
    project: project?.id ?? undefined,
    body: description?.trim() ? `${description.trim()}\n` : undefined,
    due: due ?? undefined,
    deadline: parsed.deadline ?? undefined,
    recur: parsed.recur ?? undefined,
    recur_from: parsed.recur ? (parsed.recur_from ?? "due") : undefined,
    section: section ?? undefined,
    parent: defaults.parent,
  };

  return { ok: true, title, args, warnings, blocked: null };
}
