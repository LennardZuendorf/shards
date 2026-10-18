/** Typed wrappers for note tools + cross-space read tools (search, graph, context, activity). */
import type { ActivityRow, JsonObject, Note, NoteType, SearchHit, SpaceName, TaskStatus, MemoryKind } from "../types";
import { invokeTool } from "./util";

export interface NoteListArgs {
  tags?: string[];
  any_tag?: boolean;
  owner?: string;
  note_type?: NoteType;
  since?: string;
  /** `updated` | `created` | `title` */
  sort?: string;
  limit?: number;
}

export const noteList = (args: NoteListArgs = {}) => invokeTool<Note[]>("shards_note_list", { limit: 500, ...args });

export const noteGet = (id: string) => invokeTool<Note>("shards_note_get", { id });

export const noteNew = (args: { title: string; note_type?: NoteType; tags?: string[]; owner?: string; body?: string }) =>
  invokeTool<Note>("shards_note_new", args);

export const noteAppend = (target: string, text: string, opts: { section?: string; timestamp?: boolean } = {}) =>
  invokeTool<Note>("shards_note_append", { target, text, ...opts });

/** `tags` is a tag-spec string (see `tagSpec`). */
export const noteUpdate = (target: string, args: { tags?: string; new_type?: NoteType }) =>
  invokeTool<Note>("shards_note_update", { target, ...args });

export const noteAdopt = (paths: string[], owner?: string) => invokeTool<JsonObject>("shards_note_adopt", { paths, owner });

export const noteClaim = (target: string, claimer?: string) => invokeTool<Note>("shards_note_claim", { target, claimer });

export const noteRelease = (target: string, opts: { owner?: string; force?: boolean } = {}) =>
  invokeTool<Note>("shards_note_release", { target, ...opts });

/* ------------------------------------------------------------ cross-space */

export interface SearchArgs {
  query?: string;
  type_filter?: string;
  tags?: string[];
  owner?: string;
  status?: TaskStatus;
  kind?: MemoryKind;
  project?: string;
  spaces?: SpaceName[];
  engine?: "auto" | "indexed" | "builtin" | "substring";
  limit?: number;
  threshold?: number;
  meta_only?: boolean;
  full?: boolean;
}

export const search = (args: SearchArgs) => invokeTool<SearchHit[]>("shards_search", { limit: 50, ...args });

export const health = () => invokeTool<JsonObject>("shards_health");

export const recentActivity = (args: { since?: string; owner?: string; mine?: boolean; limit?: number } = {}) =>
  invokeTool<ActivityRow[]>("shards_recent_activity", { limit: 50, ...args });

export const buildContext = (seed_id: string, depth = 1) => invokeTool<JsonObject>("shards_build_context", { seed_id, depth });

export const graph = (seed_id: string, opts: { depth?: number; direction?: "out" | "in" | "both" } = {}) =>
  invokeTool<JsonObject>("shards_graph", { seed_id, ...opts });

/** Project envelope: the project note, its tasks/notes and scoped memories. */
export const projectView = (project_id: string) => invokeTool<JsonObject>("shards_project", { project_id });

export const sessionStart = (
  args: { owner?: string; team?: boolean; meta_only?: boolean; no_memories?: boolean; budget?: number } = {},
) => invokeTool<JsonObject>("shards_session_start", args);
