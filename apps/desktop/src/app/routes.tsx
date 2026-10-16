/**
 * Route table: route name → title, icon and lazily loaded view. Views are named exports in
 * `src/views/<area>/<View>.tsx`, take no props, and read params via `useRouteParams()`.
 */
import {
  BotIcon,
  BrainIcon,
  CalendarDaysIcon,
  FileTextIcon,
  HashIcon,
  InboxIcon,
  NotebookPenIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { RouteName } from "@/lib/router";

export interface RouteDef {
  title: string;
  icon: LucideIcon;
  /** Hotkey sequence to jump here (`g i`). */
  hotkey?: string;
  view: LazyExoticComponent<ComponentType> & { preload: () => Promise<unknown> };
}

/** `lazy` for a named export, plus a `preload()` for hover intent. */
function named<M extends Record<string, unknown>>(load: () => Promise<M>, key: keyof M) {
  const view = lazy(async () => ({ default: (await load())[key] as ComponentType }));
  return Object.assign(view, { preload: load });
}

export const ROUTES: Record<RouteName, RouteDef> = {
  inbox: {
    title: "Inbox",
    icon: InboxIcon,
    hotkey: "g i",
    view: named(() => import("@/views/tasks/InboxView"), "InboxView"),
  },
  today: {
    title: "Today",
    icon: StarIcon,
    hotkey: "g t",
    view: named(() => import("@/views/tasks/TodayView"), "TodayView"),
  },
  upcoming: {
    title: "Upcoming",
    icon: CalendarDaysIcon,
    hotkey: "g u",
    view: named(() => import("@/views/tasks/UpcomingView"), "UpcomingView"),
  },
  project: {
    title: "Project",
    icon: HashIcon,
    view: named(() => import("@/views/tasks/ProjectView"), "ProjectView"),
  },
  label: {
    title: "Label",
    icon: TagIcon,
    view: named(() => import("@/views/tasks/LabelView"), "LabelView"),
  },
  search: {
    title: "Search",
    icon: SearchIcon,
    hotkey: "/",
    view: named(() => import("@/views/tasks/SearchView"), "SearchView"),
  },
  agents: {
    title: "Agents",
    icon: BotIcon,
    hotkey: "g a",
    view: named(() => import("@/views/agents/AgentsView"), "AgentsView"),
  },
  memories: {
    title: "Memories",
    icon: BrainIcon,
    hotkey: "g m",
    view: named(() => import("@/views/memories/MemoriesView"), "MemoriesView"),
  },
  scratch: {
    title: "Scratchpads",
    icon: NotebookPenIcon,
    hotkey: "g s",
    view: named(() => import("@/views/scratch/ScratchView"), "ScratchView"),
  },
  notes: {
    title: "Notes",
    icon: FileTextIcon,
    hotkey: "g n",
    view: named(() => import("@/views/notes/NotesView"), "NotesView"),
  },
  settings: {
    title: "Settings",
    icon: SettingsIcon,
    hotkey: "g ,",
    view: named(() => import("@/views/settings/SettingsView"), "SettingsView"),
  },
};

/** Preload a route's chunk (hover intent in the sidebar). */
export function preloadRoute(name: RouteName) {
  void ROUTES[name].view.preload().catch(() => {});
}
