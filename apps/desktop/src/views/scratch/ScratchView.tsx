/**
 * Scratchpads: every agent's working state, grouped by agent (board of cards), with a live
 * viewer on `/scratch/:agent/:name`.
 */
import { ArrowLeftIcon, NotebookPenIcon, PlusIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { HeaderActions } from "@/app/header";
import { isSpaceDisabled } from "@/components/agent/host-safe";
import { LiveDot, RelTime, useNow } from "@/components/agent/primitives";
import { useScratchBodies, useScratchList } from "@/components/scratch/hooks";
import "@/components/scratch/register";
import { ScratchCard } from "@/components/scratch/ScratchCard";
import { ScratchViewer } from "@/components/scratch/ScratchViewer";
import { byteLength, formatBytes, liveness } from "@/components/scratch/scratch-utils";
import { MemberAvatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Link } from "@/components/shared/Link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { scratchSet } from "@/lib/api";
import { useHotkey } from "@/lib/hotkeys";
import { useMemberMap, useMembers } from "@/lib/hooks";
import { invalidateSpaces } from "@/lib/query";
import { navigate, paths, useRouteParams } from "@/lib/router";
import type { Scratch } from "@/lib/types";
import { cn } from "@/lib/utils";

function useWide() {
  const q = "(min-width: 1180px)";
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setW(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return w;
}

export function ScratchView() {
  const { agent, name } = useRouteParams<{ agent?: string; name?: string }>();
  const list = useScratchList();
  const bodies = useScratchBodies(list.data);
  const members = useMemberMap();
  const now = useNow(15_000);
  const wide = useWide();
  const [text, setText] = useState("");
  const [hideStale, setHideStale] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const groups = useMemo(() => {
    const t = text.trim().toLowerCase();
    const map = new Map<string, Scratch[]>();
    for (const s of list.data ?? []) {
      if (agent && !name && s.agent !== agent) continue;
      const full = bodies.get(`${s.agent}/${s.name}`);
      if (hideStale && liveness(full?.updated ?? s.updated, now) === "stale") continue;
      if (t && !`${s.agent} ${s.name} ${full?.body ?? ""}`.toLowerCase().includes(t)) continue;
      const arr = map.get(s.agent) ?? [];
      arr.push(s);
      map.set(s.agent, arr);
    }
    return [...map.entries()]
      .map(([a, items]) => {
        const sorted = [...items].sort((x, y) => (y.updated ?? "").localeCompare(x.updated ?? ""));
        const bytes = sorted.reduce((n, s) => n + byteLength(bodies.get(`${s.agent}/${s.name}`)?.body ?? ""), 0);
        return { agent: a, items: sorted, bytes, last: sorted[0]?.updated ?? null, live: sorted.some((s) => liveness(s.updated, now) === "live"), active: sorted.some((s) => liveness(s.updated, now) === "active") };
      })
      .sort((a, b) => Number(b.live) - Number(a.live) || (b.last ?? "").localeCompare(a.last ?? ""));
  }, [list.data, bodies, text, hideStale, agent, name, now]);

  const flat = groups.flatMap((g) => g.items);
  const idx = flat.findIndex((s) => s.agent === agent && s.name === name);
  const open = (s: Scratch | undefined) => s && navigate(paths.scratch(s.agent, s.name), { replace: true });
  useHotkey("j", () => open(flat[Math.min(flat.length - 1, idx + 1)]), { description: "Next scratchpad", group: "Scratchpads" });
  useHotkey("k", () => open(flat[Math.max(0, idx - 1)]), { description: "Previous scratchpad", group: "Scratchpads" });
  useHotkey("n", () => setNewOpen(true), { description: "New scratchpad", group: "Scratchpads" });
  useHotkey(
    "escape",
    () => {
      if (!document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) navigate(paths.scratch());
    },
    { enabled: !!agent, allowDefault: true },
  );

  const viewing = !!agent && !!name;
  const boardHidden = viewing && !wide;
  const total = list.data?.length ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <HeaderActions>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setNewOpen(true)}>
          <PlusIcon /> New scratchpad <Kbd keys="n" className="ml-0.5" />
        </Button>
      </HeaderActions>
      {!boardHidden && (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
            {agent && !name && (
              <Link to={paths.scratch()} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeftIcon className="size-3.5" /> All agents
              </Link>
            )}
            <label className="relative w-56">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Filter scratchpads"
                aria-label="Filter scratchpads"
                className="h-7 w-full rounded-lg border border-input bg-transparent pl-7 text-small outline-none placeholder:text-muted-foreground focus:border-ring dark:bg-input/30"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch size="sm" checked={hideStale} onCheckedChange={setHideStale} /> Hide stale
            </label>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {total} file{total === 1 ? "" : "s"} · {groups.length} agent{groups.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 p-5">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : list.error ? (
              isSpaceDisabled(list.error) ? (
                <EmptyState icon={NotebookPenIcon} tone="muted" title="Scratch is turned off in this vault" />
              ) : (
                <EmptyState icon={TriangleAlertIcon} tone="muted" title="Couldn’t load scratchpads" description={(list.error as Error).message} />
              )
            ) : total === 0 ? (
              <EmptyState
                icon={NotebookPenIcon}
                title="Nothing in progress"
                description={
                  <>
                    Agents keep their session state here with <code className="rounded bg-muted px-1 font-mono text-xs">shards_scratch_set</code> — plans, checklists, notes to self. It shows up live.
                  </>
                }
                action={
                  <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                    <PlusIcon /> New scratchpad
                  </Button>
                }
              />
            ) : groups.length === 0 ? (
              <EmptyState compact icon={SearchIcon} tone="muted" title="No scratchpads match" />
            ) : (
              <div className={cn("space-y-7 px-5 py-5", !viewing && "mx-auto w-full max-w-[1180px] sm:px-10")}>
                {groups.map((g) => (
                  <section key={g.agent}>
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <MemberAvatar id={g.agent} size="md" active={g.live} />
                      <div className="min-w-0">
                        <Link to={paths.agents(g.agent)} className="text-body font-semibold tracking-tight hover:underline">
                          {members.get(g.agent)?.name ?? g.agent}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {g.items.length} file{g.items.length === 1 ? "" : "s"}
                          </span>
                          <span className="tabular-nums">{formatBytes(g.bytes)}</span>
                          {g.live ? (
                            <span className="inline-flex items-center gap-1 text-status-working">
                              <LiveDot /> writing now
                            </span>
                          ) : g.active ? (
                            <span className="text-status-working">
                              active · <RelTime iso={g.last} now={now} />
                            </span>
                          ) : (
                            <span>
                              last write <RelTime iso={g.last} now={now} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={cn("grid gap-3", viewing ? "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]")}>
                      {g.items.map((s) => (
                        <ScratchCard
                          key={s.name}
                          item={s}
                          full={bodies.get(`${s.agent}/${s.name}`)}
                          now={now}
                          selected={s.agent === agent && s.name === name}
                          onSelect={() => navigate(paths.scratch(s.agent, s.name))}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {viewing && agent && name && (
        <aside className={cn("flex min-w-0 flex-col bg-background", wide ? "w-[520px] shrink-0 border-l" : "flex-1")}>
          <ScratchViewer key={`${agent}/${name}`} agent={agent} name={name} onClose={() => navigate(paths.scratch())} />
        </aside>
      )}
      <NewScratchDialog open={newOpen} onOpenChange={setNewOpen} defaultAgent={agent} />
    </div>
  );
}

function NewScratchDialog({ open, onOpenChange, defaultAgent }: { open: boolean; onOpenChange: (o: boolean) => void; defaultAgent?: string }) {
  const members = useMembers().data ?? [];
  const agents = members.filter((m) => m.kind === "agent");
  const [agent, setAgent] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAgent(defaultAgent ?? agents[0]?.id ?? "");
      setName("");
      setBody("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!agent.trim() || !name.trim()) return;
    setBusy(true);
    try {
      const s = await scratchSet(name.trim(), body, agent.trim());
      invalidateSpaces(["scratch"]);
      onOpenChange(false);
      navigate(paths.scratch(s.agent, s.name));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void submit()}>
          <DialogHeader>
            <DialogTitle>New scratchpad</DialogTitle>
            <DialogDescription>Seed working state for an agent — a plan or checklist it picks up next session.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Agent</div>
              <Input list="scratch-agents" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="claude-code" className="h-8 text-small" />
              <datalist id="scratch-agents">
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </datalist>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Name</div>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="plan" className="h-8 font-mono text-small" />
            </div>
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={"# Plan\n- [ ] First step"} className="min-h-36 font-mono text-small" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !agent.trim() || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
