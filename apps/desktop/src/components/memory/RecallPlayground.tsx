/**
 * Recall playground: "what would an agent recall for this query, and why?". Runs
 * `shards_memory_recall` and backs the score breakdown out of the documented formula.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleSlashIcon, InfoIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { memoryRecall, type MemoryRecallArgs } from "@/lib/api";
import { useMemberMap } from "@/lib/hooks";
import { qk } from "@/lib/query";
import { setRouteQuery, useRouteQuery } from "@/lib/router";
import { MEMORY_KINDS, type Memory, type MemoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImportanceDots, KIND_META, KindIcon, kindMeta } from "./badges";
import {
  effectiveImportance,
  expiryState,
  formatScore,
  importanceWeight,
  isSuperseded,
  recallBreakdown,
  recencyWeight,
  ageDays,
  whyRecalled,
  type RecallBreakdown,
} from "./memory-utils";
import { useNow } from "@/lib/now";

const ANY = "__any__";

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

interface Hit extends Partial<Memory> {
  id: string;
  title: string;
  score: number;
  snippet?: string;
}

export function RecallPlayground({ all, onOpen }: { all: Memory[]; onOpen: (id: string) => void }) {
  const rq = useRouteQuery();
  const [query, setQuery] = useState(rq.get("rq") ?? "");
  const [owner, setOwner] = useState(ANY);
  const [kind, setKind] = useState(ANY);
  const [minImp, setMinImp] = useState<number | null>(null);
  const [limit, setLimit] = useState("10");
  const [threshold, setThreshold] = useState(ANY);
  const [decay, setDecay] = useState(true);
  const [includeExpired, setIncludeExpired] = useState(false);
  const q = useDebounced(query.trim(), 250);
  const members = useMemberMap();

  useEffect(() => setRouteQuery({ rq: q || null }), [q]);

  const args: MemoryRecallArgs = {
    owner: owner !== ANY ? owner : undefined,
    kind: kind !== ANY ? (kind as MemoryKind) : undefined,
    min_importance: minImp ?? undefined,
    limit: Number(limit),
    threshold: threshold !== ANY ? Number(threshold) : undefined,
    no_decay: decay ? undefined : true,
    include_expired: includeExpired || undefined,
  };
  const recall = useQuery({
    queryKey: qk.memories.recall(q, args),
    queryFn: () => memoryRecall(q, args) as Promise<Hit[]>,
    enabled: q.length > 0,
    placeholderData: (prev) => prev,
  });

  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const owners = useMemo(() => [...new Set(all.map((m) => m.owner).filter((x): x is string => !!x))], [all]);
  const rows = useMemo(() => {
    return (recall.data ?? []).map((h) => {
      const m = byId.get(h.id);
      const merged = { ...m, ...h, body: m?.body } as Hit;
      const b = recallBreakdown(h.score, m?.importance ?? null, m?.updated ?? h.updated, { decay });
      return { hit: merged, memory: m, b, why: whyRecalled(q, merged, b) };
    });
  }, [recall.data, byId, decay, q]);
  const max = Math.max(0.0001, ...rows.map((r) => r.b.final));

  // Text matches the recall dropped, with the reason (expired, superseded, below importance…).
  const now = useNow();
  const excluded = useMemo(() => {
    if (!q) return [];
    const hitIds = new Set(rows.map((r) => r.hit.id));
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all
      .filter((m) => !hitIds.has(m.id))
      .filter((m) => terms.some((t) => `${m.title} ${m.tags.join(" ")}`.toLowerCase().includes(t)))
      .map((m) => {
        // Recall needs every query word somewhere in the memory; name the ones it lacks.
        const text = `${m.title} ${m.tags.join(" ")} ${m.body ?? ""}`.toLowerCase();
        const missing = terms.filter((t) => !text.includes(t));
        let reason = missing.length ? `no match for “${missing.join(" ")}”` : "below threshold / limit";
        if (isSuperseded(m)) reason = "superseded";
        else if (!includeExpired && expiryState(m.expires, now) === "expired") reason = "expired";
        else if (minImp && effectiveImportance(m) < minImp) reason = `importance < ${minImp}`;
        else if (owner !== ANY && m.owner !== owner) reason = "other author";
        else if (kind !== ANY && m.kind !== kind) reason = "other kind";
        return { m, reason };
      })
      .slice(0, 8);
  }, [q, rows, all, includeExpired, minImp, owner, kind, now]);

  const topOfMind = useMemo(
    () =>
      all
        .filter((m) => !isSuperseded(m) && expiryState(m.expires) !== "expired")
        .map((m) => ({ m, w: importanceWeight(effectiveImportance(m)) * recencyWeight(ageDays(m.updated)) }))
        .sort((a, b) => b.w - a.w)
        .slice(0, 6),
    [all],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-5">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would an agent recall for…"
          className="h-11 w-full rounded-xl border border-input bg-card pr-10 pl-9 text-[15px] shadow-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring"
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery("")} className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
            <span className="text-muted-foreground">Author</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o} value={o}>
                <Avatar id={o} kind={members.get(o)?.kind} name={members.get(o)?.name} size="xs" /> {members.get(o)?.name ?? o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
            <span className="text-muted-foreground">Kind</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {MEMORY_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={threshold} onValueChange={setThreshold}>
          <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
            <span className="text-muted-foreground">Threshold</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>None</SelectItem>
            {["0.1", "0.25", "0.5", "0.75"].map((t) => (
              <SelectItem key={t} value={t}>
                ≥ {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
            <span className="text-muted-foreground">Top</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["5", "10", "30", "50"].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs">
          <span className="text-muted-foreground">Importance ≥</span>
          <ImportanceDots nullAsEmpty value={minImp} onChange={(v) => setMinImp(v === minImp ? null : v)} />
        </span>
        <label className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs">
          <Switch size="sm" checked={decay} onCheckedChange={setDecay} /> Recency decay
        </label>
        <label className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs">
          <Switch size="sm" checked={includeExpired} onCheckedChange={setIncludeExpired} /> Include expired
        </label>
      </div>

      <div className="mt-5">
        {!q ? (
          <div className="space-y-5">
            <Formula />
            {topOfMind.length > 0 && (
              <section>
                <h3 className="mb-1 text-[13px] font-semibold">Top of mind</h3>
                <p className="mb-2 text-xs text-muted-foreground">Highest importance × recency weight — these win ties for any query they match.</p>
                <div className="divide-y rounded-xl border">
                  {topOfMind.map(({ m, w }) => (
                    <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-row-hover">
                      <KindIcon kind={m.kind} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{m.title}</span>
                      <ImportanceDots value={m.importance} />
                      <span className="w-12 text-right font-mono text-xs text-muted-foreground tabular-nums">×{w.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : recall.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : recall.error ? (
          <EmptyState compact icon={CircleSlashIcon} tone="muted" title="Recall failed" description={(recall.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={SparklesIcon}
            tone="muted"
            title="Nothing would be recalled"
            description="Try a broader query, lower the threshold, include expired memories or switch recency decay off."
          />
        ) : (
          <ol className={cn("space-y-2 transition-opacity", recall.isFetching && "opacity-70")}>
            {rows.map(({ hit, memory, b, why }, i) => (
              <li key={hit.id}>
                <button type="button" onClick={() => onOpen(hit.id)} className="group w-full rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/15 hover:bg-row-hover">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {memory && <KindIcon kind={memory.kind} size="sm" />}
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{hit.title}</span>
                        <span className="font-mono text-[13px] font-semibold tabular-nums">{formatScore(b.final)}</span>
                      </div>
                      <ScoreBar b={b} max={max} />
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                        <span title="Search engine match score">match {formatScore(b.match)}</span>
                        <span title="0.6 + 0.1 × importance">× importance {b.importanceWeight.toFixed(2)}</span>
                        <span title="0.35 + 0.65 × 0.5^(age/90)">× recency {b.recencyWeight.toFixed(2)}</span>
                        {memory && <span className="font-sans">{kindMeta(memory.kind).label}</span>}
                      </div>
                      {hit.snippet && <p className="mt-2 line-clamp-2 text-[13px] text-foreground/75">{hit.snippet}</p>}
                      <ul className="mt-2 space-y-0.5">
                        {why.map((w) => (
                          <li key={w} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" /> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}

        {q && excluded.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">Matched but not recalled</h3>
            <div className="divide-y rounded-xl border border-dashed">
              {excluded.map(({ m, reason }) => (
                <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left opacity-80 hover:bg-row-hover hover:opacity-100">
                  <KindIcon kind={m.kind} size="sm" />
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSuperseded(m) && "line-through")}>{m.title}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{reason}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <InfoIcon className="size-3.5" /> Recall runs as the vault’s configured identity; other agents’ private memories are not visible here. Press <Kbd keys="escape" /> to go back.
      </p>
    </div>
  );
}

function ScoreBar({ b, max }: { b: RecallBreakdown; max: number }) {
  const pct = Math.max(2, Math.min(100, (b.final / max) * 100));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" title={`final ${formatScore(b.final)}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Formula() {
  return (
    <div className="rounded-xl border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <SparklesIcon className="size-4 text-foreground" /> How recall ranks
      </div>
      <p className="mt-2 font-mono text-[12.5px] leading-relaxed">
        score = <span className="font-medium text-foreground">match</span> × <span className="font-medium text-foreground">(0.6 + 0.1·importance)</span> × <span className="font-medium text-foreground">(0.35 + 0.65·0.5<sup>age/90d</sup>)</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Superseded memories never come back. Expired ones only with “Include expired”. Decay ranks, it never deletes: a memory untouched for 90 days keeps 67.5% of its weight.
      </p>
    </div>
  );
}
