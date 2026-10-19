/**
 * Memories: facet rail · memory list · detail/editor (master/detail on `/memories/:id`),
 * plus the Recall playground tab (`?tab=recall`).
 */
import { ArrowDownWideNarrowIcon, BrainIcon, EyeIcon, FilterIcon, FilterXIcon, PlusIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HeaderActions } from "@/app/header";
import { useNow, ListSkeleton } from "@/components/agent/primitives";
import { isSpaceDisabled } from "@/components/agent/host-safe";
import { FilterRail, clearMemoryFilters, useMemoryFilters } from "@/components/memory/FilterRail";
import { useAllMemories } from "@/components/memory/hooks";
import { MemoryDetail } from "@/components/memory/MemoryDetail";
import { MemoryDialog } from "@/components/memory/MemoryDialog";
import { MemoryRow } from "@/components/memory/MemoryRow";
import { RecallPlayground } from "@/components/memory/RecallPlayground";
import { activeFilterCount, effectiveImportance, filterMemories } from "@/components/memory/memory-utils";
import "@/components/memory/register";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHotkey } from "@/lib/hotkeys";
import { useProjects } from "@/lib/hooks";
import { navigate, paths, setRouteQuery, useRouteParams, useRouteQuery } from "@/lib/router";
import type { Memory } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORTS = { updated: "Recently updated", importance: "Importance", title: "Title" } as const;
type SortKey = keyof typeof SORTS;

function useMedia(q: string) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : true));
  useEffect(() => {
    const mm = window.matchMedia(q);
    const on = () => setM(mm.matches);
    mm.addEventListener("change", on);
    return () => mm.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** Keep the current query string when moving between `/memories` and `/memories/:id`. */
function goMemory(id: string | null, query: URLSearchParams, replace = false) {
  const q = new URLSearchParams(query);
  q.delete("open");
  const s = q.toString();
  navigate(`${paths.memories(id ?? undefined)}${s ? `?${s}` : ""}`, { replace });
}

export function MemoriesView() {
  const { id } = useRouteParams<{ id?: string }>();
  const query = useRouteQuery();
  const tab = query.get("tab") === "recall" ? "recall" : "list";
  const sort = (query.get("sort") as SortKey) in SORTS ? (query.get("sort") as SortKey) : "updated";
  const filters = useMemoryFilters();
  const memories = useAllMemories();
  const projectsData = useProjects().data;
  const now = useNow();
  const wide = useMedia("(min-width: 1280px)");
  const railMd = useMedia("(min-width: 1024px)");
  const railXl = useMedia("(min-width: 1536px)");
  const [newOpen, setNewOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => memories.data ?? [], [memories.data]);
  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const projectTitle = useMemo(() => new Map((projectsData ?? []).map((p) => [p.id, p.title])), [projectsData]);
  const result = useMemo(() => {
    const r = filterMemories(all, filters, now);
    const items = [...r.items];
    if (sort === "importance") items.sort((a, b) => effectiveImportance(b) - effectiveImportance(a) || (b.updated ?? "").localeCompare(a.updated ?? ""));
    else if (sort === "title") items.sort((a, b) => a.title.localeCompare(b.title, "en"));
    else items.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
    return { ...r, items };
  }, [all, filters, sort, now]);

  const select = (next: string | null) => goMemory(next, query);
  const index = id ? result.items.findIndex((m) => m.id === id) : -1;
  const move = (d: number) => {
    const items = result.items;
    if (!items.length) return;
    const next = items[Math.max(0, Math.min(items.length - 1, index < 0 ? 0 : index + d))];
    goMemory(next.id, query, true);
  };

  useEffect(() => {
    if (!id) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [id]);

  useHotkey("j", () => move(1), { description: "Next memory", group: "Memories", enabled: tab === "list" });
  useHotkey("k", () => move(-1), { description: "Previous memory", group: "Memories", enabled: tab === "list" });
  useHotkey("n", () => setNewOpen(true), { description: "New memory", group: "Memories" });
  useHotkey("f", () => document.getElementById("memory-filter-text")?.focus(), { description: "Filter memories", group: "Memories", enabled: tab === "list" });
  useHotkey("r", () => setRouteQuery({ tab: tab === "recall" ? null : "recall" }), { description: "Toggle recall playground", group: "Memories" });
  useHotkey(
    "escape",
    () => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      if (tab === "recall") setRouteQuery({ tab: null });
      else if (id) select(null);
    },
    { enabled: tab === "recall" || !!id, allowDefault: true },
  );

  const total = all.length;
  const hidden = result.hiddenExpired + result.hiddenSuperseded;
  const showDetail = !!id && tab === "list";
  // Rail + list + detail need room: with a detail open the rail folds into the Filters popover.
  const railWide = railMd && (!showDetail || railXl);
  const listHidden = showDetail && !wide;

  return (
    <div className="flex h-full min-h-0">
      <HeaderActions>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setNewOpen(true)}>
          <PlusIcon /> New memory <Kbd keys="n" className="ml-0.5" />
        </Button>
      </HeaderActions>

      {tab === "list" && railWide && !listHidden && <FilterRail all={all} filters={filters} className="w-60 shrink-0 border-r" />}

      {!listHidden && (
        <div className="@container/mlist flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
            <div className="inline-flex h-7 rounded-lg bg-muted p-0.5 text-xs font-medium">
              {(
                [
                  ["list", "Memories", BrainIcon],
                  ["recall", "Recall playground", SparklesIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRouteQuery({ tab: key === "list" ? null : "recall" })}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 whitespace-nowrap", tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            {tab === "list" && (
              <>
                <span className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums @2xl/mlist:inline">
                  {result.items.length}
                  {result.items.length !== total - hidden || activeFilterCount(filters) ? ` of ${total}` : ""} memories
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {!railWide && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          <FilterIcon /> Filters
                          {activeFilterCount(filters) > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilterCount(filters)}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-0">
                        <FilterRail all={all} filters={filters} />
                      </PopoverContent>
                    </Popover>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-muted-foreground">
                        <ArrowDownWideNarrowIcon /> <span className="hidden @xl/mlist:inline">{SORTS[sort]}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setRouteQuery({ sort: v === "updated" ? null : v })}>
                        {Object.entries(SORTS).map(([k, label]) => (
                          <DropdownMenuRadioItem key={k} value={k}>
                            {label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {tab === "recall" ? (
              <RecallPlayground all={all} onOpen={(mid) => goMemory(mid, new URLSearchParams())} />
            ) : memories.isLoading ? (
              <ListSkeleton rows={8} className="mx-auto max-w-3xl" />
            ) : memories.error ? (
              isSpaceDisabled(memories.error) ? (
                <EmptyState icon={BrainIcon} tone="muted" title="Memories are turned off in this vault" description="Enable the memories space in your Shards config to use agent memory." />
              ) : (
                <EmptyState icon={TriangleAlertIcon} tone="muted" title="Couldn’t load memories" description={(memories.error as Error).message} />
              )
            ) : total === 0 ? (
              <EmptyState
                icon={BrainIcon}
                title="No memories yet"
                description={
                  <>
                    Agents write memories with <code className="rounded bg-muted px-1 font-mono text-xs">shards_memory_new</code> — facts, preferences and procedures they recall next session.
                    You can add one too.
                  </>
                }
                action={
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <PlusIcon /> New memory
                  </Button>
                }
              />
            ) : result.items.length === 0 ? (
              activeFilterCount(filters) > 0 ? (
                <EmptyState
                  compact
                  icon={FilterXIcon}
                  tone="muted"
                  title="No memories match these filters"
                  action={
                    <Button variant="outline" size="sm" onClick={clearMemoryFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  compact
                  icon={EyeIcon}
                  tone="muted"
                  title="Everything here is hidden"
                  description={`${result.hiddenExpired} expired and ${result.hiddenSuperseded} superseded memories are hidden.`}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setRouteQuery({ expired: "1", superseded: "1" })}>
                      Show them
                    </Button>
                  }
                />
              )
            ) : (
              <div className="mx-auto max-w-3xl p-2">
                {result.items.map((m: Memory) => (
                  <div key={m.id} data-id={m.id}>
                    <MemoryRow
                      memory={m}
                      selected={m.id === id}
                      now={now}
                      successor={m.superseded_by ? byId.get(m.superseded_by) : undefined}
                      projectTitle={m.project ? (projectTitle.get(m.project) ?? m.project) : undefined}
                      onSelect={() => select(m.id === id ? null : m.id)}
                    />
                  </div>
                ))}
                {hidden > 0 && (
                  <div className="flex items-center justify-center gap-3 py-4 text-xs text-muted-foreground">
                    {result.hiddenExpired > 0 && !filters.includeExpired && (
                      <button type="button" className="hover:text-foreground hover:underline" onClick={() => setRouteQuery({ expired: "1" })}>
                        Show {result.hiddenExpired} expired
                      </button>
                    )}
                    {result.hiddenSuperseded > 0 && !filters.includeSuperseded && (
                      <button type="button" className="hover:text-foreground hover:underline" onClick={() => setRouteQuery({ superseded: "1" })}>
                        Show {result.hiddenSuperseded} superseded
                      </button>
                    )}
                  </div>
                )}
                <p className="flex items-center justify-center gap-3 pb-4 text-[11px] text-muted-foreground">
                  <span>
                    <Kbd keys="j" /> <Kbd keys="k" /> move
                  </span>
                  <span>
                    <Kbd keys="n" /> new
                  </span>
                  <span>
                    <Kbd keys="r" /> recall
                  </span>
                  <span>
                    <Kbd keys="e" /> edit
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showDetail && id && (
        <aside className={cn("flex min-w-0 flex-col bg-background", wide ? "w-[460px] shrink-0 border-l" : "flex-1")}>
          <MemoryDetail key={id} id={id} all={all} onClose={() => select(null)} onNavigate={(next) => select(next)} />
        </aside>
      )}

      <MemoryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaults={{ owner: filters.owner ?? undefined, project: filters.project ?? undefined }}
        onCreated={(m) => select(m.id)}
      />
    </div>
  );
}
