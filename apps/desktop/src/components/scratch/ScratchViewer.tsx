/**
 * One scratchpad: rendered/raw body that live-updates while the agent writes, an interactive
 * checklist, full edit (with a conflict check), append box and clear with undo.
 */
import {
  AlertTriangleIcon,
  BrainIcon,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Banner, LiveDot, RelTime, useNow } from "@/components/agent/primitives";
import { MemoryDialog } from "@/components/memory/MemoryDialog";
import { Markdown } from "@/components/note/Markdown";
import { MemberAvatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useHotkey } from "@/lib/hotkeys";
import { useMemberMap } from "@/lib/hooks";
import type { Scratch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScratchConflict, useAppendScratch, useClearScratch, useScratch, useSetScratch } from "./hooks";
import { byteLength, formatBytes, liveness, parseChecklist, toggleChecklistLine } from "./scratch-utils";

export function ScratchViewer({ agent, name, onClose }: { agent: string; name: string; onClose: () => void }) {
  const q = useScratch(agent, name);
  const s = q.data;
  const now = useNow(15_000);
  const members = useMemberMap();
  const setScratch = useSetScratch();
  const append = useAppendScratch();
  const clear = useClearScratch({ onDone: onClose });
  const [raw, setRaw] = useState(false);
  const [editing, setEditing] = useState<{ draft: string; base: string | null } | null>(null);
  const [conflict, setConflict] = useState<Scratch | null>(null);
  const [note, setNote] = useState("");
  const [stamp, setStamp] = useState(true);
  const [promote, setPromote] = useState(false);
  const [flash, setFlash] = useState(false);
  const lastUpdated = useRef<string | null | undefined>(undefined);
  const selfWrite = useRef(false);

  // Flash when the file changes underneath us (agent writes arrive via vault events).
  useEffect(() => {
    const u = s?.updated;
    if (lastUpdated.current !== undefined && u && u !== lastUpdated.current && !selfWrite.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2400);
      lastUpdated.current = u;
      return () => clearTimeout(t);
    }
    selfWrite.current = false;
    lastUpdated.current = u;
  }, [s?.updated]);

  useHotkey("e", () => s && setEditing({ draft: s.body ?? "", base: s.updated }), { description: "Edit scratchpad", group: "Scratchpads", enabled: !!s && !editing });
  useHotkey("v", () => setRaw((r) => !r), { description: "Toggle raw / rendered", group: "Scratchpads", enabled: !!s && !editing });
  useHotkey("a", () => document.getElementById("scratch-append")?.focus(), { description: "Leave a note for the agent", group: "Scratchpads", enabled: !!s && !editing });

  const scratchBody = s?.body;
  const prefill = useMemo(
    () => (promote ? { title: name.replace(/[-_]+/g, " "), body: scratchBody ?? "", source: `scratch:${agent}/${name}`, owner: agent } : null),
    // Snapshot when the dialog opens; live writes must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promote, agent, name],
  );

  if (!s) {
    return (
      <div className="flex h-full flex-col">
        <Bar onClose={onClose}>
          <span className="font-mono text-xs text-muted-foreground">
            {agent}/{name}
          </span>
        </Bar>
        {q.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <EmptyState compact icon={FileTextIcon} tone="muted" title="Scratchpad not found" description="The agent may have cleared it." />
        )}
      </div>
    );
  }

  const body = s.body ?? "";
  const live = liveness(s.updated, now);
  const check = parseChecklist(body);
  const who = members.get(agent)?.name ?? agent;

  const save = (draft: string, base: string | null | undefined) => {
    selfWrite.current = true;
    setScratch.mutate(
      { agent, name, body: draft, expectUpdated: base },
      {
        onSuccess: () => {
          setEditing(null);
          toast.success("Scratchpad saved");
        },
        onError: (e) => {
          selfWrite.current = false;
          if (e instanceof ScratchConflict) setConflict(e.latest);
        },
      },
    );
  };

  const toggle = (line: number) => {
    const next = toggleChecklistLine(body, line);
    if (next === body) return;
    selfWrite.current = true;
    setScratch.mutate(
      { agent, name, body: next, expectUpdated: s.updated },
      {
        onError: (e) => {
          selfWrite.current = false;
          if (e instanceof ScratchConflict) toast.warning(`${who} just wrote to this file — reloaded, try again.`);
        },
      },
    );
  };

  const sendNote = () => {
    if (!note.trim()) return;
    selfWrite.current = true;
    append.mutate({ agent, name, text: note, timestamp: stamp }, { onSuccess: () => setNote("") });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Bar onClose={onClose}>
        <MemberAvatar id={agent} size="sm" />
        <div className="min-w-0 truncate text-[13px]">
          <span className="text-muted-foreground">{who} /</span> <span className="font-mono font-medium">{name}</span>
        </div>
        {live === "live" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-working/10 px-2 py-0.5 text-[11px] font-medium text-status-working">
            <LiveDot /> Live
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {!editing && (
            <>
              <div className="mr-1 inline-flex h-7 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="View mode">
                <button type="button" role="radio" aria-checked={!raw} onClick={() => setRaw(false)} className={cn("inline-flex items-center gap-1 rounded-md px-2 text-xs", !raw ? "bg-background shadow-sm" : "text-muted-foreground")}>
                  <EyeIcon className="size-3" /> Rendered
                </button>
                <button type="button" role="radio" aria-checked={raw} onClick={() => setRaw(true)} className={cn("inline-flex items-center gap-1 rounded-md px-2 text-xs", raw ? "bg-background shadow-sm" : "text-muted-foreground")}>
                  <CodeIcon className="size-3" /> Raw
                </button>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Edit (E)" title="Edit (E)" onClick={() => setEditing({ draft: body, base: s.updated })}>
                <PencilIcon />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setPromote(true)}>
                <BrainIcon /> Promote to memory…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(body).then(() => toast.success("Copied body"))}>
                <CopyIcon /> Copy body
              </DropdownMenuItem>
              {s.path && (
                <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(s.path ?? "").then(() => toast.success("Copied path"))}>
                  <FileTextIcon /> Copy file path
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => clear.mutate({ agent, name })}>
                <Trash2Icon /> Clear scratchpad
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Bar>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
        <span>
          Updated <RelTime iso={s.updated} now={now} />
        </span>
        <span>
          Created <RelTime iso={s.created} now={now} />
        </span>
        <span className="tabular-nums">{formatBytes(byteLength(body))}</span>
        {check.total > 0 && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-status-done" style={{ width: `${(check.done / check.total) * 100}%` }} />
            </span>
            {check.done}/{check.total} done
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 py-4">
          {editing ? (
            <div className="space-y-2">
              <Banner tone={live === "live" || live === "active" ? "warning" : "muted"} icon={AlertTriangleIcon}>
                {live === "live" || live === "active" ? (
                  <>
                    <b>{who}</b> {live === "live" ? "is writing this file right now" : "wrote to this file in the last 30 minutes"}. Saving replaces the whole body; if the agent writes first you’ll be asked before overwriting.
                  </>
                ) : (
                  <>Saving replaces the whole body. {who} may write to it at any time — prefer “Leave a note” for instructions.</>
                )}
              </Banner>
              <Textarea
                autoFocus
                value={editing.draft}
                onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save(editing.draft, editing.base);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                className="min-h-80 font-mono text-[13px] leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  <Kbd keys="mod+enter" /> save · <Kbd keys="escape" /> cancel
                </span>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => save(editing.draft, editing.base)} disabled={setScratch.isPending}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className={cn("-m-2 rounded-xl p-2 transition-shadow duration-700", flash && "shadow-[0_0_0_2px_var(--status-working)]")}>
              {flash && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-status-working/10 px-2 py-0.5 text-[11px] font-medium text-status-working">
                  <LiveDot /> {who} just updated this
                </div>
              )}
              {!body.trim() ? (
                <p className="text-sm text-muted-foreground italic">Empty scratchpad.</p>
              ) : raw ? (
                <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{body}</pre>
              ) : (
                <Markdown onToggleTask={toggle}>{body}</Markdown>
              )}
            </div>
          )}
        </div>
      </div>

      {!editing && (
        <div className="shrink-0 border-t bg-background p-3">
          <div className="rounded-xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring">
            <textarea
              id="scratch-append"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendNote();
                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
              }}
              rows={2}
              placeholder={`Leave a note for ${who}… (appended to the file)`}
              className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-2 px-2 pb-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={stamp} onCheckedChange={(v) => setStamp(v === true)} /> Timestamp &amp; sign
              </label>
              <span className="ml-auto text-[11px] text-muted-foreground">
                <Kbd keys="mod+enter" />
              </span>
              <Button size="xs" onClick={sendNote} disabled={!note.trim() || append.isPending}>
                <SendIcon /> Append
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{who} wrote to this file since you started editing</AlertDialogTitle>
            <AlertDialogDescription>
              Saving now replaces their latest version (updated <RelTime iso={conflict?.updated} />). Reload to see their changes — your draft will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setEditing(null);
                setConflict(null);
              }}
            >
              Discard & reload
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editing) save(editing.draft, undefined);
                setConflict(null);
              }}
            >
              Overwrite anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemoryDialog
        open={promote}
        onOpenChange={setPromote}
        prefill={prefill}
      />
    </div>
  );
}

function Bar({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {children}
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="shrink-0">
        <XIcon />
      </Button>
    </div>
  );
}
