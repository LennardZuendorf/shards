import {
  CircleIcon,
  HashIcon,
  KeyboardIcon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  TagIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DueChip } from "@/components/shared/DueChip";
import { Kbd } from "@/components/shared/Kbd";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";
import { entityColor } from "@/lib/color";
import { useLabels, useProjectCounts, useProjects, useTasks } from "@/lib/hooks";
import { navigate, paths, type RouteName } from "@/lib/router";
import { openTask } from "./detail";
import { openQuickAdd } from "./quickadd-store";
import { ROUTES } from "./routes";
import { useThemeCycle } from "./theme";
import { openShortcuts, paletteStore } from "./ui-store";

type NavRoute = Exclude<RouteName, "project" | "label">;
const NAV: NavRoute[] = ["inbox", "today", "upcoming", "search", "agents", "memories", "scratch", "notes", "settings"];

const ITEM = "gap-2.5 [&>svg:last-child]:hidden";

/** ⌘K: navigate, create, toggle theme, jump to a task by title. */
export function CommandPalette() {
  const open = paletteStore.use();
  const [q, setQ] = useState("");
  const tasks = useTasks();
  const projects = useProjects();
  const counts = useProjectCounts();
  const labels = useLabels();
  const theme = useThemeCycle();
  const sidebar = useSidebar();

  const run = (fn: () => void) => () => {
    paletteStore.set(false);
    setQ("");
    fn();
  };

  const needle = q.trim().toLowerCase();
  const taskHits = useMemo(() => {
    if (!needle) return [];
    const words = needle.split(/\s+/);
    return (tasks.data ?? []).filter((t) => words.every((w) => t.title.toLowerCase().includes(w) || t.id.includes(w))).slice(0, 40);
  }, [needle, tasks.data]);

  const ThemeIcon = theme.next === "dark" ? MoonIcon : theme.next === "light" ? SunIcon : MonitorIcon;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        paletteStore.set(v);
        if (!v) setQ("");
      }}
      className="sm:max-w-xl"
      title="Command menu"
      description="Navigate, create and search"
    >
      <Command loop className="**:data-[slot=command-input-wrapper]:p-2">
        <CommandInput placeholder="Type a command or search tasks…" value={q} onValueChange={setQ} />
        <CommandList className="max-h-[min(60vh,440px)] scroll-py-1.5">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <span>No results.</span>
              {needle && (
                <button className="text-xs text-primary hover:underline" onClick={run(() => navigate(paths.search(q.trim())))}>
                  Search everywhere for “{q.trim()}”
                </button>
              )}
            </div>
          </CommandEmpty>

          {taskHits.length > 0 && (
            <CommandGroup heading="Tasks">
              {taskHits.map((t) => (
                <CommandItem key={t.id} value={`task ${t.title} ${t.id}`} onSelect={run(() => openTask(t.id))} className={ITEM}>
                  <CircleIcon className="text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <DueChip due={t.due} recur={t.recur} />
                    <PriorityFlag priority={t.priority} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Actions">
            <CommandItem value="add task create new" onSelect={run(() => openQuickAdd())} className={ITEM}>
              <PlusIcon className="text-primary" />
              Add task
              <Kbd keys="q" className="ml-auto" />
            </CommandItem>
            {needle && (
              <CommandItem value={`search everywhere ${q}`} onSelect={run(() => navigate(paths.search(q.trim())))} className={ITEM}>
                <SearchIcon />
                Search everywhere for “{q.trim()}”
              </CommandItem>
            )}
            <CommandItem value={`theme toggle dark light system ${theme.next}`} onSelect={run(theme.cycle)} className={ITEM}>
              <ThemeIcon />
              Switch to {theme.next} theme
            </CommandItem>
            <CommandItem value="toggle sidebar" onSelect={run(sidebar.toggleSidebar)} className={ITEM}>
              <PanelLeftIcon />
              Toggle sidebar
              <Kbd keys="mod+b" className="ml-auto" />
            </CommandItem>
            <CommandItem value="keyboard shortcuts help" onSelect={run(openShortcuts)} className={ITEM}>
              <KeyboardIcon />
              Keyboard shortcuts
              <Kbd keys="shift+?" className="ml-auto" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Go to">
            {NAV.map((n) => {
              const r = ROUTES[n];
              return (
                <CommandItem key={n} value={`go ${r.title}`} onSelect={run(() => navigate((paths[n] as () => string)()))} className={ITEM}>
                  <r.icon />
                  {r.title}
                  {r.hotkey && <Kbd keys={r.hotkey} className="ml-auto" />}
                </CommandItem>
              );
            })}
          </CommandGroup>

          {(projects.data?.length ?? 0) > 0 && (
            <CommandGroup heading="Projects">
              {projects.data?.map((p) => (
                <CommandItem key={p.id} value={`project ${p.title} ${p.id}`} onSelect={run(() => navigate(paths.project(p.id)))} className={ITEM}>
                  <HashIcon style={{ color: entityColor(p.id, p.color) }} />
                  {p.title}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{(counts ? counts.get(p.id) : p.open_count) || ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {labels.length > 0 && (
            <CommandGroup heading="Labels">
              {labels.map((l) => (
                <CommandItem key={l.name} value={`label ${l.name}`} onSelect={run(() => navigate(paths.label(l.name)))} className={ITEM}>
                  <TagIcon style={{ color: entityColor(l.name, null, 0.62, 0.13) }} />
                  {l.name}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{l.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd keys="arrowup" />
            <Kbd keys="arrowdown" /> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys="enter" /> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd keys="esc" /> close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
