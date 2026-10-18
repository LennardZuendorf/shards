import { useQueryClient } from "@tanstack/react-query";
import { CloudOffIcon, PlusIcon, RotateCwIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { Component, Suspense, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { DeleteTaskConfirm } from "@/components/task/DeleteTaskConfirm";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHotkey } from "@/lib/hotkeys";
import { readSidebarOpen, writeSidebarOpen } from "@/lib/nav";
import { useProjects, useTasks } from "@/lib/hooks";
import { runLastUndo, useVaultEvents } from "@/lib/query";
import { navigate, paths, useRoute, type RouteMatch, type RouteName } from "@/lib/router";
import { CallError, runtime } from "@/lib/transport";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { closeDetail, useDetail } from "./detail";
import { DetailPane } from "./DetailPane";
import { HEADER_ACTIONS_ID, setHeaderActionsEl, useHeaderTitleOverride } from "./header";
import { QuickAdd } from "./QuickAdd";
import { GO_ROUTES } from "./nav-lists";
import { openQuickAdd } from "./quickadd-store";
import { ROUTES } from "./routes";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { AppSidebar } from "./Sidebar";
import { openCommandPalette, paletteStore, shortcutsStore } from "./ui-store";

/* -------------------------------------------------------------- header */

function useBreadcrumb(route: RouteMatch): { parent?: string; title: string } {
  const projects = useProjects();
  const override = useHeaderTitleOverride();
  const def = ROUTES[route.name];
  if (route.name === "project") {
    const p = projects.data?.find((x) => x.id === route.params.id);
    return { parent: "Projects", title: override ?? p?.title ?? route.params.id ?? "Project" };
  }
  if (route.name === "label") return { parent: "Labels", title: override ?? route.params.name ?? "Label" };
  return { title: override ?? def.title };
}

function Header() {
  const route = useRoute();
  const crumb = useBreadcrumb(route);
  const { state, isMobile } = useSidebar();
  const def = ROUTES[route.name];
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "titlebar-drag sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70",
        // Collapsed sidebar: the macOS traffic lights sit over the header's left edge.
        (state !== "expanded" || isMobile) && "titlebar-inset",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger className="text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {state === "expanded" && !isMobile ? "Hide" : "Show"} sidebar <Kbd keys="mod+b" inverted className="ml-1" />
        </TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="mr-1 h-4! self-center!" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumb.parent ? (
          <>
            <span className="hidden text-muted-foreground sm:inline">{crumb.parent}</span>
            <span className="hidden text-muted-foreground/50 sm:inline">/</span>
          </>
        ) : (
          <def.icon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <h1 className="truncate font-semibold tracking-tight">{crumb.title}</h1>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <div id={HEADER_ACTIONS_ID} ref={setHeaderActionsEl} className="flex items-center gap-1" />
        <Button variant="ghost" size="sm" className="hidden gap-2 text-muted-foreground md:inline-flex" onClick={openCommandPalette}>
          <SearchIcon />
          <span>Search</span>
          <Kbd keys="mod+k" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" aria-label="Add task" onClick={() => openQuickAdd()} className="rounded-full">
              <PlusIcon className="stroke-[2.5]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Add task <Kbd keys="q" inverted className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------- view frame */

class ViewBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={TriangleAlertIcon}
        tone="muted"
        title="This view hit an error"
        description={<code className="text-xs">{this.state.error.message}</code>}
        action={
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            <RotateCwIcon /> Try again
          </Button>
        }
      />
    );
  }
}

function ViewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-6 py-8">
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-[18px] rounded-full" />
          <Skeleton className="h-4" style={{ width: `${50 + ((i * 37) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

function OfflineBanner() {
  const tasks = useTasks();
  const client = useQueryClient();
  const err = tasks.error;
  if (!(err instanceof CallError) || !err.offline) return null;
  return (
    <div className="flex items-center gap-3 border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-sm">
      <CloudOffIcon className="size-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 truncate">
        Can’t reach the Shards host.
        {runtime() === "browser" && (
          <span className="text-muted-foreground">
            {" "}
            Start it with <code className="rounded bg-muted px-1 font-mono text-xs">cargo run -p shards-host</code>.
          </span>
        )}
      </span>
      <Button variant="outline" size="xs" onClick={() => void client.invalidateQueries()}>
        <RotateCwIcon /> Retry
      </Button>
    </div>
  );
}

function RouteView() {
  const route = useRoute();
  const View = ROUTES[route.name].view;
  return (
    <ViewBoundary resetKey={route.path}>
      <Suspense fallback={<ViewSkeleton />}>
        <View key={route.name} />
      </Suspense>
    </ViewBoundary>
  );
}

/* ------------------------------------------------------- global hotkeys */

// One nav list (lib/nav.ts) drives the chords. `/` for Search is bound in GlobalHotkeys.
const GO = GO_ROUTES;

function NavHotkey({ name }: { name: RouteName }) {
  const r = ROUTES[name];
  useHotkey(r.hotkey ?? "", () => navigate((paths[name as "inbox"] as () => string)()), {
    description: `Go to ${r.title}`,
    group: "Navigation",
    enabled: !!r.hotkey,
  });
  return null;
}

function GlobalHotkeys() {
  const { toggleSidebar } = useSidebar();
  const { target } = useDetail();
  useHotkey("mod+k", () => paletteStore.toggle(), { description: "Command menu", group: "General" });
  useHotkey("shift+?", () => shortcutsStore.toggle(), { description: "Keyboard shortcuts", group: "General" });
  useHotkey("/", () => navigate(paths.search()), { description: "Search", group: "Navigation" });
  useHotkey("mod+z", () => runLastUndo(), { description: "Undo last action", group: "General", allowInInput: false });
  useHotkey("[", toggleSidebar, { description: "Toggle sidebar", group: "General" });
  useHotkey(
    "escape",
    () => {
      // Let an open dialog/menu consume Escape first.
      if (!document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) closeDetail();
    },
    { enabled: !!target, allowDefault: true },
  );
  return (
    <>
      {GO.map((n) => (
        <NavHotkey key={n} name={n} />
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- shell */

/** Sidebar + header + routed view + right detail pane, plus the global overlays. */
export function AppShell() {
  useVaultEvents();
  // The shadcn provider only writes a cookie and never reads it; own the state so it survives restarts.
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      open={sidebarOpen}
      onOpenChange={(v) => {
        setSidebarOpen(v);
        writeSidebarOpen(v);
      }}
    >
      <AppSidebar />
      <SidebarInset className="flex min-w-0 flex-row overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <OfflineBanner />
          <div id="main" className="relative min-h-0 flex-1 overflow-y-auto">
            <RouteView />
          </div>
        </div>
        <DetailPane />
      </SidebarInset>
      <GlobalHotkeys />
      <QuickAdd />
      <CommandPalette />
      <ShortcutsDialog />
      <DeleteTaskConfirm />
    </SidebarProvider>
  );
}
