import { ArchiveIcon, ChevronRightIcon, EllipsisIcon, PlusIcon, SearchIcon, SettingsIcon, TagIcon, TriangleAlertIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { Kbd } from "@/components/shared/Kbd";
import { ShardsLogo } from "@/components/shared/ShardsLogo";
import { Button } from "@/components/ui/button";
import { Collapsible as AnimCollapsible, CollapsibleContent as AnimCollapsibleContent } from "@/components/animate-ui/primitives/radix/collapsible";
import { Highlight, HighlightItem } from "@/components/animate-ui/primitives/effects/highlight";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AddProjectDialog } from "@/components/task/AddProjectDialog";
import { ProjectDialogs, ProjectMenuItems } from "@/components/task/ProjectMenu";
import { LabelDialogs, LabelMenuItems, type LabelDialog } from "@/components/task/LabelMenu";
import { useFavoriteLabels } from "@/components/task/label-actions";
import type { ProjectDialog } from "@/components/task/project-actions";
import { ProjectDot } from "@/components/shared/ProjectDot";
import { explainError } from "@/lib/errors";
import { useHostStatus, useLabels, useMemberMap, useMembers, useProjectCounts, useProjects, useTaskCounts, useTasks } from "@/lib/hooks";
import { readCollapsed, shellRoutes, toggleCollapsed } from "@/lib/nav";
import { useConnection } from "@/lib/query";
import { navigate, paths, useRoute, type RouteName } from "@/lib/router";
import { type NavSectionId } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";
import { SIDEBAR_FOOTER, SIDEBAR_SECTIONS, SIDEBAR_TOP } from "./nav-lists";
import { openQuickAdd } from "./quickadd-store";
import { preloadRoute, ROUTES } from "./routes";
import { ThemeToggle } from "./ThemeControls";
import { openCommandPalette } from "./ui-store";

const ACTIVE =
  "data-active:bg-accent data-active:text-foreground data-active:font-medium";

/** Nav routes: the sliding highlight paints the background, so the button only tints its text. */
const ACTIVE_NAV = `${ACTIVE} data-active:bg-transparent dark:data-active:bg-transparent`;

/** Count that rolls on change; a plain swap under reduced motion. */
function Count({ n }: { n: number }) {
  const reduce = useReducedMotion();
  const [first] = useState(n);
  if (reduce) return <>{n}</>;
  // The rolling digits are a 0–9 column per place; hide them from assistive tech and say the number once.
  return (
    <>
      <span aria-hidden="true">
        <SlidingNumber number={n} fromNumber={first} initiallyStable className="tabular-nums" />
      </span>
      <span className="sr-only">{n}</span>
    </>
  );
}

function readBool(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

function usePersistedOpen(key: string, fallback = true) {
  const [open, setOpen] = useState(() => readBool(key, fallback));
  return [
    open,
    (v: boolean) => {
      setOpen(v);
      writeBool(key, v);
    },
  ] as const;
}

function NavItem({
  name,
  to,
  active,
  badge,
  badgeClass,
  extra,
}: {
  name: RouteName;
  to: string;
  active: boolean;
  badge?: number | null;
  badgeClass?: string;
  extra?: ReactNode;
}) {
  const r = ROUTES[name];
  return (
    <HighlightItem asChild value={name}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} className={ACTIVE_NAV} tooltip={r.title}>
          <a href={`#${to}`} onMouseEnter={() => preloadRoute(name)} onFocus={() => preloadRoute(name)}>
            <r.icon />
            <span>{r.title}</span>
            {extra}
            {name === "search" && r.hotkey ? <Kbd keys={r.hotkey} className="ml-auto opacity-60" /> : null}
          </a>
        </SidebarMenuButton>
        {badge ? (
          <SidebarMenuBadge className={cn("text-muted-foreground", badgeClass)}>
            <Count n={badge} />
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    </HighlightItem>
  );
}

function SectionLabel({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <CollapsibleTrigger asChild>
      <SidebarGroupLabel asChild className="group/label cursor-pointer gap-1 font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-sidebar-foreground">
        <button type="button">
          {children}
          <ChevronRightIcon className={cn("ml-0.5 size-3! transition-transform duration-150", open && "rotate-90")} />
        </button>
      </SidebarGroupLabel>
    </CollapsibleTrigger>
  );
}

/** A compact "Couldn't load" row with a retry button (never the first-run call to action). */
function LoadErrorRow({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  const x = explainError(error, what);
  return (
    <SidebarMenuItem>
      <div className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground" title={`${x.title}. ${x.hint}\n${x.raw}`}>
        <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 truncate">Couldn’t load {what}</span>
        <Button variant="ghost" size="xs" className="px-1.5" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </SidebarMenuItem>
  );
}

function shortenPath(p: string) {
  return p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

export function AppSidebar() {
  const route = useRoute();
  const counts = useTaskCounts();
  const projects = useProjects();
  const labels = useLabels();
  const status = useHostStatus();
  const members = useMemberMap();
  const membersLoaded = useMembers().isFetched;
  const open = useTasks();
  const conn = useConnection();
  const [projOpen, setProjOpen] = usePersistedOpen("shards.sidebar.projects", true);
  const [labelOpen, setLabelOpen] = usePersistedOpen("shards.sidebar.labels", true);
  const [showArchived, setShowArchived] = usePersistedOpen("shards.sidebar.archived", false);
  const archivedCount = projects.data?.filter((p) => p.archived).length ?? 0;
  const shownProjects = projects.data?.filter((p) => showArchived || !p.archived);
  const [allLabels, setAllLabels] = useState(false);
  const [addProject, setAddProject] = useState(false);
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null);

  // One counting rule everywhere (top-level open tasks), so the badge matches the project page.
  const projectCounts = useProjectCounts();

  const workingAgents = useMemo(() => {
    const ids = new Set<string>();
    for (const t of open.data ?? []) {
      if (t.status === "claimed" && t.claimed_by && members.get(t.claimed_by)?.kind !== "human") ids.add(t.claimed_by);
    }
    return ids.size;
  }, [open.data, members]);

  const me = status.data?.me ?? null;
  const meMember = me ? members.get(me) : undefined;
  // Until members load, show a placeholder instead of the raw id in a hash colour.
  const identityReady = !!me && (!!meMember || membersLoaded);
  const loadError = open.isError && !open.data ? explainError(open.error, "tasks") : null;
  const offline = conn === "offline" || loadError?.kind === "offline";
  const refused = !offline && loadError?.kind === "forbidden";
  // Favourites first and always shown; the rest by use, the first few unless expanded.
  const favorites = useFavoriteLabels();
  const [labelDialog, setLabelDialog] = useState<LabelDialog>(null);
  const favLabels = favorites.map((n) => labels.find((l) => l.name === n) ?? { name: n, count: 0 });
  const otherLabels = labels.filter((l) => !favorites.includes(l.name));
  const shownLabels = [...favLabels, ...(allLabels ? otherLabels : otherLabels.slice(0, 8))];
  const is = (n: RouteName) => route.name === n;
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const highlighted = shellRoutes().includes(route.name) ? route.name : null;
  const reduceMotion = useReducedMotion();
  const navItem = (n: RouteName) => {
    if (n === "inbox") return <NavItem key={n} name={n} to={paths.inbox()} active={is(n)} badge={counts.inbox} />;
    if (n === "today")
      return (
        <NavItem
          key={n}
          name={n}
          to={paths.today()}
          active={is(n)}
          badge={counts.today}
          badgeClass={counts.overdue ? "text-due-overdue!" : undefined}
        />
      );
    if (n === "agents")
      return (
        <NavItem
          key={n}
          name={n}
          to={paths.agents()}
          active={is(n)}
          badge={workingAgents || null}
          badgeClass="text-status-working!"
          extra={workingAgents ? <span className="size-1.5 animate-pulse-dot rounded-full bg-status-working" aria-label="agents working" /> : null}
        />
      );
    return <NavItem key={n} name={n} to={(paths[n as "inbox"] as () => string)()} active={is(n)} />;
  };

  const tasksExtra = (
    <>
        <Collapsible open={projOpen} onOpenChange={setProjOpen} asChild>
          <SidebarGroup className="px-0 py-1">
            <SectionLabel open={projOpen}>Projects</SectionLabel>
            <SidebarGroupAction title="Add project" aria-label="Add project" onClick={() => setAddProject(true)} className="top-2.5">
              <PlusIcon />
            </SidebarGroupAction>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.isLoading &&
                    Array.from({ length: 3 }, (_, i) => (
                      <SidebarMenuItem key={i}>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    ))}
                  {shownProjects?.map((p) => {
                    const active = route.name === "project" && route.params.id === p.id;
                    const count = projectCounts ? (projectCounts.get(p.id) ?? 0) : p.open_count;
                    return (
                      <ContextMenu key={p.id}>
                        <ContextMenuTrigger asChild>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={active} className={ACTIVE} tooltip={p.title}>
                              <a
                                href={`#${paths.project(p.id)}`}
                                onMouseEnter={() => preloadRoute("project")}
                                className={cn(p.archived && "text-muted-foreground")}
                              >
                                {p.archived ? (
                                  <ArchiveIcon aria-label="Archived" />
                                ) : (
                                  <ProjectDot id={p.id} className="mx-1 size-2.5" />
                                )}
                                <span>{p.title}</span>
                              </a>
                            </SidebarMenuButton>
                            {count > 0 && (
                              <SidebarMenuBadge className="text-muted-foreground transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
                                <Count n={count} />
                              </SidebarMenuBadge>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover aria-label={`${p.title} actions`}>
                                  <EllipsisIcon />
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start" className="w-52">
                                <ProjectMenuItems project={p} kind="dropdown" onDialog={setProjectDialog} />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuItem>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          <ProjectMenuItems project={p} kind="context" onDialog={setProjectDialog} />
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                  {projects.isError && !projects.data && (
                    <LoadErrorRow what="projects" error={projects.error} onRetry={() => void projects.refetch()} />
                  )}
                  {archivedCount > 0 && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="sm"
                        className="text-muted-foreground"
                        aria-pressed={showArchived}
                        onClick={() => setShowArchived(!showArchived)}
                      >
                        <ArchiveIcon />
                        <span>{showArchived ? "Hide archived" : `Show archived (${archivedCount})`}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {projects.data && projects.data.length === 0 && (
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => setAddProject(true)} className="text-muted-foreground">
                        <PlusIcon />
                        <span>Create your first project</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {open.isError && !open.data && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">Labels</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <LoadErrorRow what="labels" error={open.error} onRetry={() => void open.refetch()} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <LabelDialogs
          dialog={labelDialog}
          onClose={() => setLabelDialog(null)}
          onRenamed={(from, to) => {
            if (route.name === "label" && route.params.name === from) navigate(paths.label(to));
          }}
        />
        {labels.length > 0 && (
          <Collapsible open={labelOpen} onOpenChange={setLabelOpen} asChild>
            <SidebarGroup className="px-0 py-1">
              <SectionLabel open={labelOpen}>Labels</SectionLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {shownLabels.map((l) => {
                      const active = route.name === "label" && route.params.name === l.name;
                      return (
                        <SidebarMenuItem key={l.name}>
                          <SidebarMenuButton asChild isActive={active} className={ACTIVE} size="sm">
                            <a href={`#${paths.label(l.name)}`} onMouseEnter={() => preloadRoute("label")}>
                              <TagIcon className="text-muted-foreground" />
                              <span>{l.name}</span>
                            </a>
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="top-1! text-muted-foreground transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
                            <Count n={l.count} />
                          </SidebarMenuBadge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction showOnHover aria-label={`@${l.name} actions`} className="top-1!">
                                <EllipsisIcon />
                              </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start" className="w-56">
                              <LabelMenuItems name={l.name} onDialog={setLabelDialog} />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      );
                    })}
                    {otherLabels.length > 8 && (
                      <SidebarMenuItem>
                        <SidebarMenuButton size="sm" className="text-muted-foreground" onClick={() => setAllLabels((v) => !v)}>
                          <ChevronRightIcon className={cn("transition-transform", allLabels && "-rotate-90")} />
                          <span>{allLabels ? "Show less" : `Show all ${otherLabels.length}`}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
    </>
  );

  return (
    <Sidebar collapsible="offcanvas" className="border-r-sidebar-border">
      <SidebarHeader className="gap-1 px-3 pt-3 pb-1">
        <div data-tauri-drag-region="deep" className="titlebar-drag titlebar-inset flex h-8 items-center gap-2 px-1">
          <ShardsLogo className="size-[22px]" />
          <span className="font-heading text-xl font-medium tracking-tight">Shards</span>
          <div className="ml-auto flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={openCommandPalette}>
                  <SearchIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Command menu <Kbd keys="mod+k" inverted className="ml-1" />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-3 px-3">
        <Highlight
          controlledItems
          mode="parent"
          value={highlighted}
          click={false}
          exitDelay={0}
          className="inset-0 rounded-md bg-accent"
          containerClassName="flex flex-col gap-2.5"
        >
          <SidebarGroup className="pb-1">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => openQuickAdd()}
                    className="group/add font-medium text-foreground hover:bg-accent"
                  >
                    <span className="grid size-[18px] place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-hover/add:scale-105">
                      <PlusIcon className="size-3! stroke-3" />
                    </span>
                    <span>Add task</span>
                    <Kbd keys="q" className="ml-auto opacity-0 transition-opacity group-hover/add:opacity-100" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {SIDEBAR_TOP.map((n) => (
                  <NavItem key={n} name={n} to={(paths[n as "search"] as () => string)()} active={is(n)} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {SIDEBAR_SECTIONS.map((section) => {
            const open = !collapsed.includes(section.id);
            return (
              <AnimCollapsible
                key={section.id}
                open={open}
                onOpenChange={() => setCollapsed(toggleCollapsed(section.id))}
                asChild
              >
                <SidebarGroup className="flint-tray p-1.5">
                  <SectionLabel open={open}>{section.label}</SectionLabel>
                  <AnimCollapsibleContent transition={reduceMotion ? { duration: 0 } : undefined}>
                    <SidebarGroupContent>
                      <SidebarMenu>{section.routes.map(navItem)}</SidebarMenu>
                    </SidebarGroupContent>
                    {section.id === ("tasks" satisfies NavSectionId) && tasksExtra}
                  </AnimCollapsibleContent>
                </SidebarGroup>
              </AnimCollapsible>
            );
          })}
        </Highlight>
      </SidebarContent>

      <SidebarFooter className="gap-1 px-3 py-3">
        <div className="flex items-center gap-2">
          {identityReady && me ? (
            <Avatar id={me} name={meMember?.name} kind={meMember?.kind ?? "human"} color={meMember?.color} size="md" />
          ) : (
            <span className="size-7 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{identityReady ? (meMember?.name ?? me) : me ? "\u00a0" : "You"}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  offline || refused ? "bg-destructive" : conn === "live" ? "bg-success" : "animate-pulse-dot bg-warning",
                )}
              />
              <span title={refused ? loadError?.hint : undefined}>{offline ? "Offline" : refused ? "Refused by host" : conn === "live" ? "Live" : "Connecting…"}</span>
              {status.data?.vault && (
                <span className="truncate" title={status.data.vault}>
                  · {shortenPath(status.data.vault)}
                </span>
              )}
            </div>
          </div>
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={is(SIDEBAR_FOOTER[0]) ? "secondary" : "ghost"} size="icon-sm" aria-label="Settings" onClick={() => navigate(paths.settings())}>
                <SettingsIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>
      <SidebarRail />
      <AddProjectDialog open={addProject} onOpenChange={setAddProject} />
      <ProjectDialogs dialog={projectDialog} onClose={() => setProjectDialog(null)} />
    </Sidebar>
  );
}
