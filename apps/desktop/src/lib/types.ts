/**
 * Domain types for the Shards UI. Shapes mirror the core's JSON rendering (`src/render.rs`,
 * `TASK_FIELDS`, `NOTE_FIELDS`, `MEMORY_FIELDS`, `SCRATCH_FIELDS`). Task-model-v2 fields are
 * optional: the UI must work on a vault that has none of them.
 */

/* ------------------------------------------------------------------ tasks */

export type TaskStatus = "open" | "claimed" | "done" | "cancelled";
export const TASK_STATUSES: readonly TaskStatus[] = ["open", "claimed", "done", "cancelled"];

/** v2 adds `urgent` (Todoist P1). Reads stay free-form, so unknown strings are possible. */
export type Priority = "urgent" | "high" | "normal" | "low";
export const PRIORITIES: readonly Priority[] = ["urgent", "high", "normal", "low"];

export type RecurFrom = "due" | "completion";

/** A task row as `shards_task_list` / `shards_task_get` render it. */
export interface Task {
  id: string;
  type: "task";
  title: string;
  tags: string[];
  owner: string | null;
  created: string | null;
  updated: string | null;
  related?: string[];
  status: TaskStatus;
  priority: Priority | (string & {}) | null;
  claimed_by: string | null;
  project: string | null;
  blocks: string[];
  blocked_by: string[];
  /* task-model-v2 (all optional) */
  /** `YYYY-MM-DD` or floating local `YYYY-MM-DDTHH:MM`. */
  due?: string | null;
  /** `YYYY-MM-DD` hard limit. */
  deadline?: string | null;
  /** RRULE subset, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`. */
  recur?: string | null;
  recur_from?: RecurFrom | null;
  parent?: string | null;
  section?: string | null;
  order?: number | null;
  /** RFC 3339 `…Z`; set on finish, cleared on reopen. */
  completed?: string | null;
  /* read-time extras */
  ready?: boolean;
  body?: string;
  path?: string;
  /** finish: ids of tasks this finish unblocked. */
  unblocked?: string[];
  /** finish of a recurring task: the next due date. */
  next_due?: string | null;
  /** claim: blockers still open. */
  blocked_by_unsatisfied?: string[];
  warnings?: string[];
}

/* ------------------------------------------------------------------ notes */

export type NoteType = "note" | "log" | "decision" | "reference" | "project";
export const NOTE_TYPES: readonly NoteType[] = ["note", "log", "decision", "reference", "project"];

export interface Note {
  id: string;
  type: NoteType | (string & {});
  title: string;
  tags: string[];
  owner: string | null;
  claimed_by?: string | null;
  created: string | null;
  updated: string | null;
  related?: string[];
  body?: string;
  path?: string;
  /** Project notes may carry these (unknown keys round-trip). */
  slug?: string | null;
  color?: string | null;
  warnings?: string[];
}

/* --------------------------------------------------------------- memories */

export type MemoryKind = "fact" | "preference" | "procedure" | "insight" | "episode";
export const MEMORY_KINDS: readonly MemoryKind[] = ["fact", "preference", "procedure", "insight", "episode"];
export type MemoryScope = "shared" | "private";
export const MEMORY_SCOPES: readonly MemoryScope[] = ["shared", "private"];

export interface Memory {
  id: string;
  type: "memory";
  title: string;
  tags: string[];
  owner: string | null;
  created: string | null;
  updated: string | null;
  related?: string[];
  kind: MemoryKind | (string & {});
  scope: MemoryScope | (string & {});
  project: string | null;
  importance: number | null;
  source: string | null;
  expires: string | null;
  superseded_by: string | null;
  body?: string;
  path?: string;
  /** recall extras */
  score?: number;
  snippet?: string;
}

/* ---------------------------------------------------------------- scratch */

export interface Scratch {
  type: "scratch";
  name: string;
  agent: string;
  tags: string[];
  created: string | null;
  updated: string | null;
  bytes?: number;
  body?: string;
  path?: string;
}

/* ----------------------------------------------------------------- assets */

export interface Asset {
  id: string;
  type: "asset";
  title: string;
  tags: string[];
  owner: string | null;
  created: string | null;
  updated: string | null;
  related?: string[];
  filename: string;
  media_type: string;
  bytes: number;
  sha256: string;
  blob: string;
  path?: string;
}

/* ----------------------------------------------------------------- search */

export type SpaceName = "notes" | "tasks" | "memories" | "scratch" | "assets";
export const SPACES: readonly SpaceName[] = ["notes", "tasks", "memories", "scratch", "assets"];

export interface SearchHit {
  id: string;
  type: string;
  title: string;
  score: number;
  path: string;
  tags?: string[];
  owner?: string;
  updated?: string;
  snippet?: string;
  space?: SpaceName;
}

/* ---------------------------------------------------------------- graph */

/** One node in a `shards_graph` result: an entity's frontmatter plus its path. */
export interface GraphNode {
  id: string;
  type: string;
  title?: string;
  path?: string;
  related?: string[];
  kind?: string;
  status?: string;
}

/** `{"seed","nodes","edges"}`; edges are `[from, to]` in link direction. */
export interface GraphResult {
  seed: string;
  nodes: GraphNode[];
  edges: [string, string][];
}

export interface ActivityRow {
  id: string | null;
  type: string | null;
  title: string | null;
  path: string;
  /** seconds since epoch */
  mtime: number;
  owner: string | null;
  claimed_by: string | null;
}

/* ------------------------------------------------------------------- host */

export type MemberKind = "human" | "agent";

export interface Member {
  id: string;
  kind: MemberKind;
  name: string;
  color?: string | null;
}

export interface Project {
  id: string;
  title: string;
  slug?: string | null;
  color?: string | null;
  sections: string[];
  /**
   * The part of `sections` the project note stores (`sections:`); the rest is placed by task
   * order. Absent on hosts that predate it.
   */
  stored_sections?: string[];
  open_count: number;
  /** Frontmatter `archived: true`: hidden from the sidebar and pickers unless shown. */
  archived?: boolean;
  /** `host_project_update` only: ids of tasks whose `section` a rename rewrote. */
  renamed_tasks?: string[];
}

export interface HostStatus {
  vault: string;
  config_path: string | null;
  me: string | null;
  version: string;
  spaces: Partial<Record<SpaceName, string | null>>;
  counts: Partial<Record<SpaceName, number>>;
  /** Nearest folder at or above the vault holding `.obsidian/`; absent on an older host. */
  obsidian_vault?: string | null;
}

/** One Markdown file in the notes space (`host_notes_browse`): Shards notes and foreign files. */
export interface NoteFile {
  /** Vault-relative (absolute when the notes root sits outside the vault). */
  path: string;
  abs_path: string;
  /** Notes-root-relative parent folder, `""` at the root. */
  folder: string;
  title: string;
  /** The Shards id, or `null` for a file another editor wrote. */
  id: string | null;
  tags: string[];
  modified: string | null;
  /** `host_note_read` only. */
  body?: string;
}

/** What every host_*_delete / forget / clear returns: the raw bytes needed to undo. */
export interface DeletedFile {
  id?: string;
  path: string;
  content: string;
}

export interface BodyUpdate {
  id: string;
  updated: string;
}

/** The core's JSON error envelope (`message` of a domain error). */
export interface ErrorEnvelope {
  kind: string;
  message: string;
  next_action?: string;
  [k: string]: unknown;
}

/* ----------------------------------------------------------- agent states */

/** D4: the session state an agent-owned/claimed task shows. */
export type AgentSessionState = "working" | "awaiting" | "done" | "error" | "idle";

export type JsonObject = Record<string, unknown>;
