/** Left facet rail for the memory list. Filters live in the route query (deep-linkable). */
import { EyeOffIcon, FilterXIcon, SearchIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { Kbd } from "@/components/shared/Kbd";
import { Switch } from "@/components/ui/switch";
import { useMemberMap, useProjects } from "@/lib/hooks";
import { setRouteQuery, useRouteQuery } from "@/lib/router";
import { MEMORY_KINDS, type Memory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImportanceDots, KIND_META } from "./badges";
import { activeFilterCount, expiryState, isSuperseded, type MemoryFilters } from "./memory-utils";
import { useNow } from "@/lib/now";

/** Read the memory filters from the route query. */
export function useMemoryFilters(): MemoryFilters {
  const q = useRouteQuery();
  const kinds = q.get("kind");
  return useMemo(
    () => ({
      text: q.get("q") ?? "",
      kinds: kinds ? kinds.split(",").filter(Boolean) : [],
      scope: q.get("scope"),
      project: q.get("project"),
      owner: q.get("owner"),
      minImportance: Number(q.get("imp") ?? 0) || 0,
      includeExpired: q.get("expired") === "1",
      includeSuperseded: q.get("superseded") === "1",
    }),
    [q, kinds],
  );
}

export const clearMemoryFilters = () =>
  setRouteQuery({ q: null, kind: null, scope: null, project: null, owner: null, imp: null, expired: null, superseded: null });

function Facet({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <div className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  );
}

function FacetItem({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent font-medium text-foreground" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {children}
      {count != null && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}

export function FilterRail({ all, filters, className }: { all: Memory[]; filters: MemoryFilters; className?: string }) {
  const members = useMemberMap();
  const projects = useProjects().data ?? [];
  const now = useNow();
  const counts = useMemo(() => {
    const kind = new Map<string, number>();
    const owner = new Map<string, number>();
    const project = new Map<string, number>();
    let expired = 0;
    let superseded = 0;
    let priv = 0;
    let shared = 0;
    for (const m of all) {
      const visible = !isSuperseded(m) && expiryState(m.expires, now) !== "expired";
      if (isSuperseded(m)) superseded++;
      else if (expiryState(m.expires, now) === "expired") expired++;
      if (!visible) continue;
      kind.set(m.kind, (kind.get(m.kind) ?? 0) + 1);
      if (m.owner) owner.set(m.owner, (owner.get(m.owner) ?? 0) + 1);
      if (m.project) project.set(m.project, (project.get(m.project) ?? 0) + 1);
      if (m.scope === "private") priv++;
      else shared++;
    }
    return { kind, owner, project, expired, superseded, priv, shared };
  }, [all, now]);

  const toggleKind = (k: string) => {
    const set = new Set(filters.kinds);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    setRouteQuery({ kind: [...set].join(",") || null });
  };
  const n = activeFilterCount(filters);

  return (
    <nav aria-label="Memory filters" className={cn("flex flex-col gap-4 overflow-y-auto px-2 py-3", className)}>
      <label className="relative mx-0.5 block">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="memory-filter-text"
          aria-label="Filter memories"
          value={filters.text ?? ""}
          onChange={(e) => setRouteQuery({ q: e.target.value || null })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setRouteQuery({ q: null });
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Filter memories"
          className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring dark:bg-input/30"
        />
        <Kbd keys="f" className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2" />
      </label>

      {n > 0 && (
        <button type="button" onClick={clearMemoryFilters} className="mx-2 -mt-2 inline-flex items-center gap-1 self-start text-xs font-medium text-foreground underline-offset-2 hover:underline">
          <FilterXIcon className="size-3" /> Clear {n} filter{n > 1 ? "s" : ""}
        </button>
      )}

      <Facet title="Kind">
        {MEMORY_KINDS.map((k) => {
          const M = KIND_META[k];
          return (
            <FacetItem key={k} active={!!filters.kinds?.includes(k)} onClick={() => toggleKind(k)} count={counts.kind.get(k) ?? 0}>
              <M.icon className={cn("size-3.5", M.text)} />
              {M.label}
            </FacetItem>
          );
        })}
      </Facet>

      <Facet title="Scope">
        {(["shared", "private"] as const).map((s) => (
          <FacetItem key={s} active={filters.scope === s} onClick={() => setRouteQuery({ scope: filters.scope === s ? null : s })} count={s === "private" ? counts.priv : counts.shared}>
            <span className="capitalize">{s}</span>
          </FacetItem>
        ))}
      </Facet>

      {counts.owner.size > 0 && (
        <Facet title="Author">
          {[...counts.owner.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, c]) => {
              const m = members.get(id);
              return (
                <FacetItem key={id} active={filters.owner === id} onClick={() => setRouteQuery({ owner: filters.owner === id ? null : id })} count={c}>
                  <Avatar id={id} kind={m?.kind} name={m?.name} color={m?.color} size="xs" />
                  <span className="truncate">{m?.name ?? id}</span>
                </FacetItem>
              );
            })}
        </Facet>
      )}

      {counts.project.size > 0 && (
        <Facet title="Project">
          {[...counts.project.entries()].map(([id, c]) => (
            <FacetItem key={id} active={filters.project === id} onClick={() => setRouteQuery({ project: filters.project === id ? null : id })} count={c}>
              <span className="truncate">{projects.find((p) => p.id === id)?.title ?? id}</span>
            </FacetItem>
          ))}
        </Facet>
      )}

      <Facet title="Importance at least">
        <div className="flex items-center gap-2 px-2 py-1">
          <ImportanceDots nullAsEmpty value={filters.minImportance || null} onChange={(v) => setRouteQuery({ imp: v === filters.minImportance ? null : String(v) })} size="md" />
          {filters.minImportance ? (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setRouteQuery({ imp: null })}>
              any
            </button>
          ) : null}
        </div>
      </Facet>

      <Facet title="Hidden">
        <label className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-muted">
          <EyeOffIcon className="size-3.5 text-muted-foreground" />
          Expired
          <span className="text-xs text-muted-foreground tabular-nums">{counts.expired}</span>
          <Switch size="sm" className="ml-auto" checked={!!filters.includeExpired} onCheckedChange={(v) => setRouteQuery({ expired: v ? "1" : null })} />
        </label>
        <label className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-muted">
          <EyeOffIcon className="size-3.5 text-muted-foreground" />
          Superseded
          <span className="text-xs text-muted-foreground tabular-nums">{counts.superseded}</span>
          <Switch size="sm" className="ml-auto" checked={!!filters.includeSuperseded} onCheckedChange={(v) => setRouteQuery({ superseded: v ? "1" : null })} />
        </label>
      </Facet>
    </nav>
  );
}
