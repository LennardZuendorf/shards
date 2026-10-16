/**
 * Read-only notes browser (R22): every Markdown file in the notes space, Shards notes and files
 * other editors wrote alike. Writing happens in the operator's editor ("Open in", R41).
 */
import { FileTextIcon, FolderIcon, HashIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSpaceDisabled } from "@/components/agent/host-safe";
import { ListSkeleton, useNow } from "@/components/agent/primitives";
import { useNoteSearch } from "@/components/note/hooks";
import { NoteFileReader } from "@/components/note/NoteFileReader";
import "@/components/note/register";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/dates";
import { useHotkey } from "@/lib/hotkeys";
import { useNoteFiles } from "@/lib/hooks";
import { navigate, paths, setRouteQuery, useRouteParams, useRouteQuery } from "@/lib/router";
import { cn } from "@/lib/utils";
import { filterFiles, folderCounts, tagCounts } from "./filter";

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
  // `?folder=.` is the notes root; an empty query value would be dropped from the URL.
  const folderParam = query.get("folder");
  const folder = folderParam === "." ? "" : folderParam;
  const tag = query.get("tag");
  const files = useNoteFiles();
  const searchHits = useNoteSearch(text);
  const now = useNow();
  // Side-by-side only when the reader keeps ~500 px next to the 340 px list (sidebar included).
  const twoPane = useMedia("(min-width: 1100px)");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => files.data ?? [], [files.data]);
  const folders = useMemo(() => folderCounts(all), [all]);
  const tags = useMemo(() => tagCounts(all), [all]);
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
  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useHotkey("j", () => move(1), { description: "Next file", group: "Notes" });
  useHotkey("k", () => move(-1), { description: "Previous file", group: "Notes" });
  useHotkey("f", () => searchRef.current?.focus(), { description: "Filter files", group: "Notes" });

  // Open the newest file on wide screens so the reader is never blank.
  useEffect(() => {
    if (!selected && twoPane && rows.length && !text) goFile(rows[0].file.path, query, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, twoPane, rows.length]);

  const showList = twoPane || !selected;
  const clearFilters = () => setRouteQuery({ q: null, folder: null, tag: null });

  return (
    <div className="flex h-full min-h-0">
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
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 dark:bg-input/30"
              />
              <Kbd keys="f" className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2" />
            </label>
            <div className="flex flex-wrap items-center gap-1">
              <FilterMenu
                icon={<FolderIcon className="size-3" />}
                label={folder === null ? "All folders" : folder === "" ? "Root" : folder}
                active={folder !== null}
                title="Filter by folder"
                options={[["", all.filter((f) => !f.folder).length] as [string, number], ...folders]}
                render={(f) => (f === "" ? "Root (no folder)" : f)}
                indent={(f) => (f ? f.split("/").length - 1 : 0)}
                value={folder}
                onChange={(v) => setRouteQuery({ folder: v === "" ? "." : v })}
              />
              {tags.length > 0 && (
                <FilterMenu
                  icon={<HashIcon className="size-3" />}
                  label={tag ?? "Tag"}
                  active={!!tag}
                  title="Filter by tag"
                  options={tags}
                  render={(t) => `#${t}`}
                  value={tag}
                  onChange={(v) => setRouteQuery({ tag: v })}
                />
              )}
              {(folder !== null || tag) && (
                <button type="button" aria-label="Clear filters" onClick={() => setRouteQuery({ folder: null, tag: null })} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <XIcon className="size-3" />
                </button>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {rows.length === all.length ? `${all.length} files` : `${rows.length} of ${all.length}`}
              </span>
            </div>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {files.isLoading ? (
              <ListSkeleton rows={8} />
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
              rows.map(({ file: f, snippet }) => {
                const sel = f.path === selected;
                return (
                  <button
                    key={f.path}
                    data-path={f.path}
                    type="button"
                    onClick={() => goFile(f.path, query)}
                    className={cn(
                      "relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/40",
                      sel && "bg-primary/7 hover:bg-primary/9 dark:bg-primary/12",
                    )}
                  >
                    {sel && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                    <FileTextIcon className={cn("mt-0.5 size-4 shrink-0", f.id ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{f.title}</span>
                      {snippet ? (
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{snippet}</span>
                      ) : (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {f.folder && <span className="truncate">{f.folder}</span>}
                          {f.folder && f.modified && <span aria-hidden>·</span>}
                          <span className="shrink-0 tabular-nums">{relativeTime(f.modified, now)}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
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

function FilterMenu({
  icon,
  label,
  active,
  title,
  options,
  render,
  indent,
  value,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  title: string;
  options: [string, number][];
  render: (v: string) => string;
  indent?: (v: string) => number;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex h-6 max-w-44 items-center gap-1 rounded-md px-1.5 text-xs", active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          {icon} <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map(([v, c]) => (
          <DropdownMenuCheckboxItem key={v || "(root)"} checked={value === v} onCheckedChange={(on) => onChange(on ? v : null)}>
            <span className="truncate" style={indent ? { paddingLeft: `${indent(v) * 10}px` } : undefined}>
              {render(v)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{c}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
