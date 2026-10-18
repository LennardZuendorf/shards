/**
 * Shared UI contract for desktop-app/34–41 (tech.md § Planned). Types and constants only, no
 * React: the sidebar, notes-tree and task-view tracks import names from here so they cannot
 * drift apart. Route titles, icons and hotkeys stay in `app/routes.tsx`.
 */
import type { DueBucket } from "./dates";
import type { RouteName } from "./router";
import type { Priority } from "./types";

/* ---------------------------------------------------------------- navigation (R1) */

export type NavSectionId = "tasks" | "agents" | "library";

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** Fixed destinations in order. Projects and Labels follow the Tasks routes as their own lists. */
  routes: readonly RouteName[];
}

/**
 * The one navigation order for the sidebar, the `g` chords and the command palette. Search sits
 * above the sections and Settings in the footer. Waiting on me (desktop-app/29) and Completed
 * (desktop-app/25) join the Tasks routes, after Upcoming, when their routes exist.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "tasks", label: "Tasks", routes: ["inbox", "today", "upcoming"] },
  { id: "agents", label: "Agent team", routes: ["agents", "memories", "scratch"] },
  { id: "library", label: "Library", routes: ["notes"] },
];

/** Every route in `NAV_SECTIONS`, in order. */
export function navRoutes(): RouteName[] {
  return NAV_SECTIONS.flatMap((s) => s.routes);
}

/* ---------------------------------------------------------------- view options (R43, R44) */

/** `default` is the view's delivered grouping (its own `TaskGroupSpec`). */
export type GroupBy = "default" | "none" | "due" | "priority" | "project" | "section" | "assignee" | "label";
export type SortBy = "manual" | "due" | "priority" | "title" | "created" | "updated";
export type SortDir = "asc" | "desc";
export type Density = "comfortable" | "compact";

export interface TaskFilters {
  priority?: Priority[];
  due?: DueBucket[];
  labels?: string[];
  /** Member ids; `""` means unassigned. */
  assignees?: string[];
  hasDeadline?: boolean;
  blocked?: boolean;
}

export interface ViewOptions {
  group: GroupBy;
  sort: SortBy;
  dir: SortDir;
  density: Density;
  filters: TaskFilters;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  group: "default",
  sort: "manual",
  dir: "asc",
  density: "comfortable",
  filters: {},
};

export type ViewId = "inbox" | "today" | "upcoming" | "waiting" | `project:${string}` | `label:${string}`;

/** localStorage key for one view's options. */
export function viewOptionsKey(view: ViewId): string {
  return `shards.view.${view}`;
}

/* ---------------------------------------------------------------- notes trees (R42) */

export interface TreeNode {
  /** Full path: `Projects/launch` for a folder, `project/shards` for a tag. `""` is the root. */
  key: string;
  /** Last path segment. */
  name: string;
  /** Listed files at or below this node, each counted once. */
  count: number;
  children: TreeNode[];
}

/* ---------------------------------------------------------------- per-device preferences */

export const PREF_KEYS = {
  /** Sidebar open/closed (R1: persists across restarts). */
  sidebarOpen: "shards.sidebar.open",
  /** Collapsed nav section ids, a JSON string array. */
  navCollapsed: "shards.sidebar.sections",
  /** Notes trees: `{ expanded: string[], folder: string | null, tag: string | null }`. */
  notesTree: "shards.notes.tree",
} as const;
