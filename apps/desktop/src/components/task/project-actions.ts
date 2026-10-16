/**
 * Project management: rename, recolor, archive, delete — from the project header "…" menu and
 * the sidebar row context menu (one item list, two menu kits).
 *
 * Title, color, `archived` and sections live in the project note's frontmatter and need the
 * `host_project_update` tool; on hosts without it those items are disabled with a hint. Delete
 * works on every host: open tasks move to the Inbox, then `host_note_delete`; Undo restores the
 * note bytes (`host_restore`) and moves the tasks back.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hostNoteDelete, hostProjectUpdate, hostRestore, taskList, taskUpdate, type ProjectUpdate } from "@/lib/api";
import { explainError } from "@/lib/errors";
import { invalidateSpaces, qk, toastWithUndo } from "@/lib/query";
import { navigate, paths, useRoute } from "@/lib/router";
import type { Project, Task } from "@/lib/types";

/** What the menus ask their owner to open (dialogs live outside the menu so they survive its close). */
export type ProjectDialog = { kind: "rename" | "delete"; project: Project } | null;

/** The 10 swatches of the color picker (the host accepts these names, plus `#hex`). */
export const PROJECT_COLORS = ["red", "orange", "yellow", "green", "teal", "sky", "blue", "violet", "pink", "gray"] as const;

export const NEEDS_HOST = "Needs a newer Shards host (host_project_update)";

/* ---------------------------------------------------------------- update */

/** `set` applied to one cached project row (what the host will answer, minus task renames). */
export function applyProjectUpdate(p: Project, set: ProjectUpdate): Project {
  const next: Project = { ...p };
  if (set.title !== undefined) next.title = set.title.trim();
  if (set.color !== undefined) next.color = set.color.trim().toLowerCase() || null;
  if (set.archived !== undefined) next.archived = set.archived;
  if (set.sections || set.renames) {
    const renames = set.renames ?? {};
    const out: string[] = [];
    for (const raw of set.sections ?? p.sections) {
      const s = raw.trim();
      const name = s in renames ? renames[s].trim() : s;
      if (name && !out.includes(name)) out.push(name);
    }
    next.sections = out;
    if (set.sections) next.stored_sections = out;
  }
  return next;
}

/** Optimistic `host_project_update` on the projects cache (and on cached tasks for renames). */
export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, set }: { id: string; set: ProjectUpdate }) => hostProjectUpdate(id, set),
    onMutate: async ({ id, set }) => {
      await client.cancelQueries({ queryKey: qk.host.projects });
      const before = client.getQueryData<Project[]>(qk.host.projects);
      if (before) client.setQueryData<Project[]>(qk.host.projects, before.map((p) => (p.id === id ? applyProjectUpdate(p, set) : p)));
      return { before };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.before) client.setQueryData(qk.host.projects, ctx.before);
      const x = explainError(e, "project");
      toast.error(x.kind === "outdated" ? NEEDS_HOST : `Couldn’t update the project: ${x.raw}`);
    },
    onSettled: (_d, _e, { set }) => {
      void client.invalidateQueries({ queryKey: qk.host.projects });
      void client.invalidateQueries({ queryKey: qk.notes.all });
      if (set.renames) invalidateSpaces(["tasks"], client);
    },
  });
}

/**
 * Archive or unarchive, with Undo. The toast lives in the mutation's own callbacks (not the
 * `mutate` ones), so it still fires when the menu that started it has already unmounted.
 */
export function useArchiveProject() {
  const client = useQueryClient();
  const m = useMutation({
    meta: { silent: true },
    mutationFn: ({ p, archived }: { p: Project; archived: boolean }) => hostProjectUpdate(p.id, { archived }),
    onMutate: async ({ p, archived }) => {
      await client.cancelQueries({ queryKey: qk.host.projects });
      const before = client.getQueryData<Project[]>(qk.host.projects);
      if (before) client.setQueryData<Project[]>(qk.host.projects, before.map((x) => (x.id === p.id ? { ...x, archived } : x)));
      return { before };
    },
    onSuccess: (_r, { p, archived }) => {
      toastWithUndo(
        archived ? `Archived “${p.title}”` : `Unarchived “${p.title}”`,
        async () => {
          await hostProjectUpdate(p.id, { archived: !archived });
        },
        archived ? { description: "Hidden from the sidebar. Find it under “Show archived”." } : undefined,
      );
    },
    onError: (e, _v, ctx) => {
      if (ctx?.before) client.setQueryData(qk.host.projects, ctx.before);
      const x = explainError(e, "project");
      toast.error(x.kind === "outdated" ? NEEDS_HOST : `Couldn’t update the project: ${x.raw}`);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.host.projects });
    },
  });
  return (p: Project, archived: boolean) => m.mutate({ p, archived });
}

/* ---------------------------------------------------------------- delete */

/** Move open tasks to the Inbox, delete the note; Undo restores both. */
export function useDeleteProject() {
  const client = useQueryClient();
  const route = useRoute();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (p: Project) => {
      const open = await taskList({ project: p.id, status: "open,claimed" });
      const moved: Task[] = [];
      for (const t of open) {
        await taskUpdate(t.id, { project: "", section: "" });
        moved.push(t);
      }
      let file: { path: string; content: string } | null = null;
      try {
        file = await hostNoteDelete(p.id);
      } catch (e) {
        // A project that exists only as an id on tasks has no note to delete.
        if (!/not found|no note|unknown id/i.test(explainError(e).raw)) {
          for (const t of moved) await taskUpdate(t.id, { project: t.project ?? "", section: t.section ?? "" }).catch(() => {});
          throw e;
        }
      }
      return { file, moved };
    },
    onSuccess: ({ file, moved }, p) => {
      if (route.name === "project" && route.params.id === p.id) navigate(paths.inbox());
      toastWithUndo(
        `Deleted project “${p.title}”`,
        async () => {
          if (file) await hostRestore(file);
          for (const t of moved) await taskUpdate(t.id, { project: p.id, section: t.section ?? "" });
        },
        { description: moved.length ? `${moved.length} open task${moved.length > 1 ? "s" : ""} moved to the Inbox.` : undefined },
      );
    },
    onError: (e) => toast.error(`Couldn’t delete the project: ${explainError(e).raw}`),
    onSettled: () => {
      invalidateSpaces(["tasks", "notes"], client);
    },
  });
}

