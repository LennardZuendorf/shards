/**
 * Read-only notes browser (R22): every Markdown file in the notes space, Shards notes and files
 * other editors wrote alike. Writing happens in the operator's editor ("Open in", R41).
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileTextIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSpaceDisabled } from "@/components/agent/host-safe";
import { ListSkeleton, useNow } from "@/components/agent/primitives";
import { useNoteSearch } from "@/components/note/hooks";
import { NoteFileReader } from "@/components/note/NoteFileReader";
import "@/components/note/register";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { usePersistentState } from "@/components/task/hooks";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/dates";
import { useHotkey } from "@/lib/hotkeys";
import { useNoteFiles } from "@/lib/hooks";
import { navigate, paths, setRouteQuery, useRouteParams, useRouteQuery } from "@/lib/router";
import { PREF_KEYS } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";
import { filterFiles } from "./filter";
import { NotesTree } from "./NotesTree";
import { buildFolderTree, buildTagTree, DEFAULT_EXPANDED, TREE_COLUMN, type TreeSelection } from "./tree";

/** `PREF_KEYS.notesTree`: expanded row ids (`s:`/`f:`/`t:` prefixed, see `flattenTree`) + selection. */
interface TreePrefs extends TreeSelection {
  expanded: string[];
}
const DEFAULT_PREFS: TreePrefs = { expanded: [...DEFAULT_EXPANDED], folder: null, tag: null };
const ROW_HEIGHT = 52;

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mm = window.matchMedia(q);
    const on = () => setM(mm.matches);
    mm.addEventListener("change", on);
    return () => mm.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** Select a file by path (`?p=`), keeping the filters. `null` closes the reader. */
function goFile(path: string | null, query: URLSearchParams, replace = false) {
  const q = new URLSearchParams(query);
  q.delete("open");
  if (path) q.set("p", path);
  else q.delete("p");
  const s = q.toString();
  navigate(`${paths.notes()}${s ? `?${s}` : ""}`, { replace });
}

export function NotesView() {
  const { id } = useRouteParams<{ id?: string }>();
  const query = useRouteQuery();
  const text = query.get("q") ?? "";
  // Folder and tag live in the per-device pref (R42). A `?folder=` / `?tag=` link is moved into it
  // once; `?folder=.` is the notes root (an empty query value would be dropped from the URL).
  const [stored, setPrefs] = usePersistentState<TreePrefs>(PREF_KEYS.notesTree, DEFAULT_PREFS);
  const prefs: TreePrefs = {
    expanded: Array.isArray(stored?.expanded) ? stored.expanded.filter((x) => typeof x === "string") : DEFAULT_PREFS.expanded,
    folder: typeof stored?.folder === "string" ? stored.folder : null,
    tag: typeof stored?.tag === "string" ? stored.tag : null,
  };
  const { folder, tag } = prefs;
  const folderParam = query.get("folder");
  const tagParam = query.get("tag");
  useEffect(() => {
    if (folderParam === null && tagParam === null) return;
    setPrefs((p) => ({ ...DEFAULT_PREFS, ...p, folder: folderParam === "." ? "" : folderParam, tag: tagParam }));
    setRouteQuery({ folder: null, tag: null });
  }, [folderParam, tagParam, setPrefs]);
  const setSelection = useCallback((sel: TreeSelection) => setPrefs((p) => ({ ...DEFAULT_PREFS, ...p, ...sel })), [setPrefs]);
  const expandedList = prefs.expanded.join("\n");
  const expanded = useMemo(() => new Set(expandedList ? expandedList.split("\n") : []), [expandedList]);
  const setExpanded = useCallback(
    (id: string, open: boolean) =>
      setPrefs((p) => {
        const list = Array.isArray(p?.expanded) ? p.expanded : DEFAULT_PREFS.expanded;
        return { ...DEFAULT_PREFS, ...p, expanded: open ? [...new Set([...list, id])] : list.filter((x) => x !== id) };
      }),
    [setPrefs],
  );
  const files = useNoteFiles();
  const searchHits = useNoteSearch(text);
  const now = useNow();
  // Side-by-side only when the reader keeps ~500 px next to the 340 px list (sidebar included).
  const twoPane = useMedia("(min-width: 1100px)");
  // The 240px tree column; `⌘\` or the header button toggles it, remembered with the tree prefs.
  const treeOpen = expanded.has(TREE_COLUMN);
  const setTreeToggle = (open: boolean) => setExpanded(TREE_COLUMN, open);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => files.data ?? [], [files.data]);
  const folderTree = useMemo(() => buildFolderTree(all), [all]);
  const tagTree = useMemo(() => buildTagTree(all), [all]);
  const rows = useMemo(() => {
    const hits = new Map<string, string | undefined>();
    for (const h of searchHits.data ?? []) hits.set(h.path, h.snippet);
    return filterFiles(all, { text, folder, tag }, hits);
  }, [all, text, folder, tag, searchHits.data]);

  // `/notes/<n-id>` (links from tasks, agents, wikilinks to Shards notes) maps onto its file.
  // `?p=` may be absolute (search hits carry absolute paths); select the listed row for it.
  const pParam = query.get("p");
  const fromP = pParam ? (all.find((f) => f.path === pParam || f.abs_path === pParam)?.path ?? pParam) : undefined;
  const selected = fromP ?? (id ? all.find((f) => f.id === id)?.path : undefined) ?? null;
  const selectedFile = selected ? all.find((f) => f.path === selected) : undefined;

  const index = selected ? rows.findIndex((r) => r.file.path === selected) : -1;
  const move = (d: number) => {
    if (!rows.length) return;
    goFile(rows[Math.max(0, Math.min(rows.length - 1, index < 0 ? 0 : index + d))].file.path, query, true);
  };
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (i) => rows[i].file.path,
    overscan: 8,
    paddingStart: 6,
    paddingEnd: 6,
  });
  // j/k (and any other selection change) keep the active row in view; it may not be mounted.
  useEffect(() => {
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [index, virtualizer]);

  useHotkey("j", () => move(1), { description: "Next file", group: "Notes" });
  useHotkey("k", () => move(-1), { description: "Previous file", group: "Notes" });
  useHotkey("f", () => searchRef.current?.focus(), { description: "Filter files", group: "Notes" });
  useHotkey("mod+\\", () => setTreeToggle(!treeOpen), { description: "Toggle folder and tag trees", group: "Notes" });

  // Open the newest file on wide screens so the reader is never blank.
  useEffect(() => {
    if (!selected && twoPane && rows.length && !text) goFile(rows[0].file.path, query, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, twoPane, rows.length]);

  const showList = twoPane || !selected;
  const clearFilters = () => {
    setRouteQuery({ q: null });
    setSelection({ folder: null, tag: null });
  };
  const treeLabel = [folder === null ? null : folder === "" ? "Root" : folder, tag ? `#${tag}` : null].filter(Boolean).join(" · ");
  const countLabel = rows.length === all.length ? `${all.length} files` : `${rows.length} of ${all.length}`;

  return (
    <div className="flex h-full min-h-0">
      {showList && treeOpen && all.length > 0 && (
        <div className="flex w-[240px] shrink-0 flex-col border-r">
          <div className="flex h-[52px] shrink-0 items-center justify-end border-b px-2">
            <button type="button" aria-label="Hide folders and tags" title="Hide folders and tags (⌘\)" onClick={() => setTreeToggle(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <PanelLeftCloseIcon className="size-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NotesTree folders={folderTree} tags={tagTree} expanded={expanded} onExpandedChange={setExpanded} selection={{ folder, tag }} onSelect={setSelection} />
          </div>
        </div>
      )}
      {showList && (
        <div className={cn("flex min-h-0 flex-col", twoPane ? "w-[340px] shrink-0 border-r" : "flex-1")}>
          <div className="space-y-2 border-b px-3 py-2.5">
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={text}
                onChange={(e) => setRouteQuery({ q: e.target.value || null })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setRouteQuery({ q: null });
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Enter" && rows[0]) goFile(rows[0].file.path, query);
                }}
                placeholder="Filter by title, path or text"
                aria-label="Filter notes"
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring dark:bg-input/30"
              />
              <Kbd keys="f" className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2" />
            </label>
            <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              {!treeOpen && all.length > 0 && (
                <button type="button" aria-label="Show folders and tags" title="Show folders and tags (⌘\)" onClick={() => setTreeToggle(true)} className="-ml-0.5 rounded p-0.5 hover:text-foreground">
                  <PanelLeftOpenIcon className="size-3.5" />
                </button>
              )}
              {treeLabel ? (
                <span data-testid="notes-filter" className="inline-flex min-w-0 items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-accent-foreground">
                  <span className="truncate">
                    {treeLabel} · <span className="tabular-nums">{rows.length}</span> files
                  </span>
                  <button type="button" aria-label="Clear folder and tag filter" onClick={() => setSelection({ folder: null, tag: null })} className="rounded hover:text-foreground">
                    <XIcon className="size-3" />
                  </button>
                </span>
              ) : null}
              {!(treeLabel && !text) && (
                <span data-testid="notes-count" className="ml-auto shrink-0 tabular-nums">
                  {countLabel}
                </span>
              )}
            </div>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {files.isLoading ? (
              <div className="p-1.5">
                <ListSkeleton rows={8} />
              </div>
            ) : files.error ? (
              isSpaceDisabled(files.error) ? (
                <EmptyState compact icon={FileTextIcon} tone="muted" title="Notes are turned off in this vault" />
              ) : (
                <EmptyState compact icon={TriangleAlertIcon} tone="muted" title="Couldn’t load notes" description={(files.error as Error).message} />
              )
            ) : all.length === 0 ? (
              <EmptyState compact icon={FileTextIcon} title="No Markdown files yet" description="Notes are the Markdown files in your vault. Write them in your editor; Shards shows them here." />
            ) : rows.length === 0 ? (
              <EmptyState
                compact
                icon={SearchIcon}
                tone="muted"
                title="No files match"
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div role="list" aria-label="Files" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const { file: f, snippet } = rows[v.index];
                  const sel = f.path === selected;
                  return (
                    <div key={v.key} role="listitem" className="absolute inset-x-0 top-0 px-1.5" style={{ height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}>
                      <button
                        data-path={f.path}
                        type="button"
                        onClick={() => goFile(f.path, query)}
                        className={cn(
                          "relative flex h-full w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-left outline-none transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring",
                          sel && "bg-accent",
                        )}
                      >
                        {sel && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                        <FileTextIcon className={cn("size-4 shrink-0 self-start mt-2", f.id ? "text-foreground" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] leading-[18px] font-medium">{f.title}</span>
                          {snippet ? (
                            <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">{snippet}</span>
                          ) : (
                            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                              {f.folder && <span className="truncate">{f.folder}</span>}
                              {f.folder && f.modified && <span aria-hidden>·</span>}
                              <span className="shrink-0 tabular-nums">{relativeTime(f.modified, now)}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selected ? (
        <div className="min-w-0 flex-1">
          <NoteFileReader key={selected} path={selected} fallback={selectedFile} onClose={twoPane ? undefined : () => goFile(null, query)} />
        </div>
      ) : (
        twoPane && (
          <div className="grid min-w-0 flex-1 place-items-center">
            {!files.isLoading && all.length > 0 && <EmptyState compact icon={FileTextIcon} tone="muted" title="Select a file" description="Use J / K to move through the list." />}
          </div>
        )
      )}
    </div>
  );
}
