/**
 * UI-only host tools (crates/shards-host; never on agent MCP). Some may not exist yet on an
 * older host; the `*Safe` helpers degrade to data derived from the agent tools.
 */
import type { BodyUpdate, DeletedFile, HostStatus, JsonObject, Member, NoteFile, Project, Task } from "../types";
import { isUnknownToolError } from "../errors";
import { CallError } from "../transport";
import { noteList } from "./notes";
import { taskList } from "./tasks";
import { invokeTool } from "./util";

export const hostStatus = () => invokeTool<HostStatus>("host_status");
export const hostMembers = () => invokeTool<Member[]>("host_members");
export const hostProjects = () => invokeTool<Project[]>("host_projects");
export const hostDashboard = () => invokeTool<JsonObject>("host_dashboard");
/** Every Markdown file in the notes space, newest first (read-only browser). */
export const hostNotesBrowse = () => invokeTool<NoteFile[]>("host_notes_browse");
/** One browsed file with its body; `path` as `hostNotesBrowse` returns it. */
export const hostNoteRead = (path: string) => invokeTool<NoteFile>("host_note_read", { path });

export const hostTaskDelete = (id: string) => invokeTool<DeletedFile>("host_task_delete", { id });
export const hostNoteDelete = (id: string) => invokeTool<DeletedFile>("host_note_delete", { id });
export const hostMemoryForget = (id: string) => invokeTool<DeletedFile>("host_memory_forget", { id });
export const hostScratchClear = (name: string, agent?: string) => invokeTool<DeletedFile>("host_scratch_clear", { name, agent });
/** Undo for every delete above: writes the raw bytes back (refuses to overwrite). */
export const hostRestore = (file: { path: string; content: string }) =>
  invokeTool<{ path: string }>("host_restore", { path: file.path, content: file.content });

/**
 * Project metadata in the project note's frontmatter: `title`, `color` (a named palette color
 * or `#hex`; `""` clears), `archived` (`false` removes the key) and `sections` (ordered list,
 * empty sections included). `renames` maps an old section name to a new one (`""` removes it):
 * the host rewrites `section` on every task of the project (each task its own atomic write),
 * then the stored list. Older hosts answer "unknown tool"; feature-detect with
 * `hostProjectUpdateSupported`.
 */
export interface ProjectUpdate {
  title?: string;
  color?: string;
  archived?: boolean;
  sections?: string[];
  renames?: Record<string, string>;
}
export const hostProjectUpdate = (id: string, set: ProjectUpdate) => invokeTool<Project>("host_project_update", { id, ...set });

/**
 * Does this host implement `host_project_update`? Probes with no arguments: a host that has
 * the tool rejects the call as invalid input; one that lacks it says "unknown tool".
 */
export async function hostProjectUpdateSupported(): Promise<boolean> {
  try {
    await invokeTool("host_project_update", {});
    return true;
  } catch (e) {
    if (isUnknownToolError(e)) return false;
    if (e instanceof CallError && e.offline) throw e;
    return true;
  }
}

export const hostTaskSetBody = (id: string, body: string) => invokeTool<BodyUpdate>("host_task_set_body", { id, body });
export const hostNoteSetBody = (id: string, body: string) => invokeTool<BodyUpdate>("host_note_set_body", { id, body });
export const hostMemorySetBody = (id: string, body: string) => invokeTool<BodyUpdate>("host_memory_set_body", { id, body });

/* ------------------------------------------------------------- fallbacks */

const AGENT_RE = /(^|[-_])(agent|bot)$|agent$|bot$/i;

/** Heuristic kind for an id when the host does not tell us (mirrors the host's rule). */
export function guessMemberKind(id: string, me?: string | null): Member["kind"] {
  if (me && id === me) return "human";
  return AGENT_RE.test(id) || /claude|codex|gpt|gemini|cursor|copilot/i.test(id) ? "agent" : "human";
}

/** Projects from the host, or derived from task `project` ids when `host_projects` is missing. */
export async function projectsSafe(tasks?: Task[]): Promise<Project[]> {
  try {
    return await hostProjects();
  } catch (e) {
    // Only an older host (no such tool) degrades to derived data. Anything else (offline,
    // forbidden …) fails, so the UI shows an error instead of an empty vault.
    if (!isUnknownToolError(e)) throw e;
    const [rows, notes] = await Promise.all([
      tasks ?? taskList({ status: "open,claimed" }).catch(() => [] as Task[]),
      noteList({ note_type: "project", limit: 500 }).catch(() => []),
    ]);
    const map = new Map<string, Project>();
    for (const n of notes) {
      map.set(n.id, { id: n.id, title: n.title, slug: n.slug ?? null, color: n.color ?? null, sections: [], open_count: 0 });
    }
    for (const t of rows) {
      if (!t.project) continue;
      const p = map.get(t.project) ?? { id: t.project, title: t.project, sections: [], open_count: 0 };
      if (t.status === "open" || t.status === "claimed") p.open_count += 1;
      if (t.section && !p.sections.includes(t.section)) p.sections.push(t.section);
      map.set(t.project, p);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "en"));
  }
}

/** Members from the host, or derived from task owners/claimers. */
export async function membersSafe(me?: string | null, tasks?: Task[]): Promise<Member[]> {
  try {
    return await hostMembers();
  } catch (e) {
    if (!isUnknownToolError(e)) throw e;
    const rows = tasks ?? (await taskList({}).catch(() => [] as Task[]));
    const ids = new Set<string>();
    if (me) ids.add(me);
    for (const t of rows) {
      if (t.owner) ids.add(t.owner);
      if (t.claimed_by) ids.add(t.claimed_by);
    }
    return [...ids].map((id) => ({ id, kind: guessMemberKind(id, me), name: id }));
  }
}
