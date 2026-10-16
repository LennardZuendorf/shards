import { useQuery } from "@tanstack/react-query";
import { BrainIcon, FileTextIcon, ListTodoIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { compareByDue, highlight, matchesQuery } from "@/components/task/model";
import { TaskList } from "@/components/task/TaskList";
import { TaskView } from "@/components/task/TaskView";
import { openDetail, type DetailKind } from "@/app/detail";
import { search } from "@/lib/api";
import { relativeTime } from "@/lib/dates";
import { useTasks } from "@/lib/hooks";
import { qk } from "@/lib/query";
import { navigate, setRouteQuery, useRouteQuery } from "@/lib/router";
import { fileRoute } from "@/components/note/wikilinks";
import type { SearchHit, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Hl({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-primary/15 px-px text-inherit dark:bg-primary/25">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Full-text search: `shards_search` ranked hits + an instant client filter over loaded tasks. */
export function SearchView() {
  const routeQ = useRouteQuery().get("q") ?? "";
  const [text, setText] = useState(routeQ);
  const [scope, setScope] = useState<"open" | "all">("open");
  const query = useDebounced(text.trim(), 180);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRouteQuery({ q: query || null });
  }, [query]);
  useEffect(() => input.current?.focus(), []);

  const open = useTasks();
  const doneArgs = useMemo(() => ({ status: "done,cancelled" }), []);
  const done = useTasks(doneArgs, { enabled: scope === "all" && !!query });
  const hits = useQuery({
    queryKey: qk.search({ query }),
    queryFn: () => search({ query, limit: 60 }),
    enabled: query.length > 1,
    staleTime: 10_000,
  });

  const pool = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of open.data ?? []) m.set(t.id, t);
    if (scope === "all") for (const t of done.data ?? []) m.set(t.id, t);
    return m;
  }, [open.data, done.data, scope]);

  const { tasks, others } = useMemo(() => {
    if (!query) return { tasks: [] as Task[], others: [] as SearchHit[] };
    const out: Task[] = [];
    const seen = new Set<string>();
    const rest: SearchHit[] = [];
    for (const h of hits.data ?? []) {
      if (h.type === "task") {
        const t = pool.get(h.id);
        if (t && !seen.has(t.id)) {
          out.push(t);
          seen.add(t.id);
        }
      } else rest.push(h);
    }
    const local = [...pool.values()].filter((t) => !seen.has(t.id) && matchesQuery(t, query)).sort(compareByDue);
    return { tasks: [...local, ...out], others: rest };
  }, [query, hits.data, pool]);

  const loading = query.length > 1 && hits.isLoading && !tasks.length;

  return (
    <TaskView title="Search">
      <div className="sticky top-0 z-10 -mx-2 mb-4 bg-background/90 px-2 pb-3 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="flex h-11 items-center gap-2.5 rounded-xl border bg-background px-3 shadow-xs focus-within:border-foreground/20 focus-within:ring-3 focus-within:ring-ring/15">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (text) setText("");
                else (e.target as HTMLInputElement).blur();
              }
              if (e.key === "ArrowDown" || e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Search tasks, notes and memories…"
            aria-label="Search"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          {text && (
            <button type="button" aria-label="Clear" onClick={() => setText("")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <XIcon className="size-3.5" />
            </button>
          )}
          <ToggleGroup type="single" size="sm" variant="outline" value={scope} onValueChange={(v) => v && setScope(v as "open" | "all")}>
            <ToggleGroupItem value="open" className="px-2.5 text-xs">
              Open
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="px-2.5 text-xs">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {query && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            {loading ? "Searching…" : `${tasks.length} task${tasks.length === 1 ? "" : "s"}${others.length ? ` · ${others.length} other result${others.length === 1 ? "" : "s"}` : ""}`}
            <span className="ml-2 hidden sm:inline">
              <Kbd keys="j" /> <Kbd keys="k" /> to move · <Kbd keys="enter" /> to open
            </span>
          </p>
        )}
      </div>

      {!query ? (
        <EmptyState icon={SearchIcon} title="Search everything" description="Titles, labels, sections and ids match instantly; full text comes from the vault index." />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 && others.length === 0 ? (
        <EmptyState icon={SearchXIcon} tone="muted" title={`No results for “${query}”`} description={scope === "open" ? "Try “All” to include completed tasks." : "Try fewer or different words."} />
      ) : (
        <>
          {tasks.length > 0 && (
            <ResultSection icon={<ListTodoIcon className="size-3.5" />} title="Tasks">
              <TaskList
                static
                storageKey="search"
                groups={[{ key: "tasks", tasks, compare: () => 0, collapsible: false }]}
                rowProps={{
                  showProject: true,
                  renderTitle: (title) => <Hl text={title} query={query} />,
                }}
              />
            </ResultSection>
          )}
          {others.length > 0 && (
            <ResultSection icon={<FileTextIcon className="size-3.5" />} title="Notes & memories">
              <ul className="divide-y divide-border/70 border-y border-border/70">
                {others.map((h) => (
                  <OtherHit key={`${h.space}-${h.id}`} hit={h} query={query} />
                ))}
              </ul>
            </ResultSection>
          )}
        </>
      )}
    </TaskView>
  );
}

function ResultSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mb-2">
      <h2 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

const KIND_OF_SPACE: Record<string, DetailKind> = { notes: "note", memories: "memory", tasks: "task" };

function OtherHit({ hit, query }: { hit: SearchHit; query: string }) {
  const kind = KIND_OF_SPACE[hit.space ?? ""] ?? (hit.type === "memory" ? "memory" : "note");
  const Icon = kind === "memory" ? BrainIcon : FileTextIcon;
  const snippet = plainSnippet(hit.snippet ?? "").slice(0, 220);
  return (
    <li>
      <button
        type="button"
        onClick={() => (kind === "note" ? navigate(fileRoute(hit.path)) : openDetail({ kind, id: hit.id }))}
        className="flex w-full items-start gap-2.5 px-1 py-2.5 text-left transition-colors hover:bg-row-hover"
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", kind === "memory" ? "text-primary" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px]">
              <Hl text={hit.title || hit.id} query={query} />
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hit.type}</span>
          </div>
          {snippet && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
              <Hl text={snippet} query={query} />
            </p>
          )}
          {hit.updated && <p className="mt-0.5 text-[11px] text-muted-foreground/70">Updated {relativeTime(hit.updated)}</p>}
        </div>
      </button>
    </li>
  );
}

/** Search snippets are raw Markdown; show them as plain text (links, emphasis, list marks). */
function plainSnippet(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|\*|`)(?=\S)([^*`]+?)\1/g, "$2")
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.|>)\s+/gm, "")
    // Keep line breaks readable once collapsed: "app\nPublish" → "app · Publish".
    .replace(/([^\s.:;!?,])[ \t]*\n\s*(?=\S)/g, "$1 · ")
    .replace(/\s+/g, " ")
    .trim();
}
