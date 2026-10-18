/** Memory detail/editor panel: properties, body editor, supersession chain, forget. */
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BrainIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  ClockIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  GaugeIcon,
  HashIcon,
  LinkIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ReplaceIcon,
  ShapesIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Banner, PropRow, RelTime, useNow } from "@/components/agent/primitives";
import { isUnknownTool } from "@/components/agent/host-safe";
import { Markdown } from "@/components/note/Markdown";
import { TagEditor } from "@/components/note/TagEditor";
import { MemberAvatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { tagSpec, type MemoryUpdateArgs } from "@/lib/api";
import { useHotkey } from "@/lib/hotkeys";
import { useMemberMap, useProjects } from "@/lib/hooks";
import { MEMORY_KINDS, type Memory, type MemoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExpiryBadge, ImportanceDots, KIND_META, KindIcon, kindMeta } from "./badges";
import { useAppendMemory, useForgetMemory, useMemory, useSetMemoryBody, useUpdateMemory } from "./hooks";
import { MemoryDialog } from "./MemoryDialog";
import { expiryState, recallEligibility, supersessionChain } from "./memory-utils";
import { useRenderReset } from "@/hooks/use-render-reset";

const NONE = "__none__";

function copy(text: string, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error("Clipboard unavailable"),
  );
}

export interface MemoryDetailProps {
  id: string;
  /** Every memory (incl. expired/superseded) for chain + successor lookup. */
  all?: Memory[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  className?: string;
}

export function MemoryDetail({ id, all = [], onClose, onNavigate, className }: MemoryDetailProps) {
  const fromList = all.find((m) => m.id === id);
  const q = useMemory(id);
  // The list row is the freshest for frontmatter (optimistic); the detail fetch adds the body.
  const memory: Memory | undefined = q.data ? { ...q.data, ...(fromList ?? {}), body: q.data.body } : fromList;
  const now = useNow();
  const update = useUpdateMemory();
  const forget = useForgetMemory({ onDone: onClose });
  const [supersedeOpen, setSupersedeOpen] = useState(false);

  useHotkey("e", () => document.getElementById("memory-edit-body")?.click(), { description: "Edit memory body", group: "Memories", enabled: !!memory });
  useHotkey("shift+s", () => setSupersedeOpen(true), { description: "Supersede memory", group: "Memories", enabled: !!memory });
  useHotkey("mod+backspace", () => memory && forget.mutate(memory), { description: "Forget memory", group: "Memories", enabled: !!memory, allowInInput: false });

  if (!memory) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <PanelBar onClose={onClose} />
        {q.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <EmptyState compact icon={BrainIcon} tone="muted" title="Memory not found" description={`${id} may have been forgotten or replaced.`} />
        )}
      </div>
    );
  }

  const set = (args: MemoryUpdateArgs) => update.mutate({ memory, args });
  const elig = recallEligibility(memory, now);
  const successor = memory.superseded_by ? all.find((m) => m.id === memory.superseded_by) : undefined;
  const exp = expiryState(memory.expires, now);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <PanelBar onClose={onClose}>
        <KindIcon kind={memory.kind} size="sm" />
        <button type="button" className="font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => copy(memory.id, "id")} title="Copy id">
          {memory.id}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setSupersedeOpen(true)} title="Write a corrected version (⇧S)">
            <ReplaceIcon /> Supersede
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => copy(memory.id, "id")}>
                <CopyIcon /> Copy id
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copy(`[[${memory.id}]]`, "wikilink")}>
                <LinkIcon /> Copy wikilink
              </DropdownMenuItem>
              {memory.path && (
                <DropdownMenuItem onSelect={() => copy(memory.path ?? "", "path")}>
                  <FileIcon /> Copy file path
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => forget.mutate(memory)}>
                <Trash2Icon /> Forget
                <DropdownMenuShortcut>
                  <Kbd keys="mod+backspace" />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PanelBar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          <EditableTitle value={memory.title} onSave={(title) => set({ title })} struck={!!memory.superseded_by} />

          <div className="flex flex-wrap items-center gap-2">
            {elig.ok ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success/10 px-2 text-[11.5px] font-medium text-success">
                <CheckCircle2Icon className="size-3" /> Recalled
              </span>
            ) : (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11.5px] font-medium text-muted-foreground">
                <CircleSlashIcon className="size-3" /> Not recalled · {elig.reason}
              </span>
            )}
            {memory.scope === "private" && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-warning">
                <LockIcon className="size-3" /> Private to {memory.owner ?? "its author"}
              </span>
            )}
          </div>

          {memory.superseded_by && (
            <Banner
              tone="muted"
              icon={ReplaceIcon}
              action={
                <Button variant="outline" size="xs" onClick={() => memory.superseded_by && onNavigate(memory.superseded_by)}>
                  Open <ArrowRightIcon />
                </Button>
              }
            >
              Replaced by <span className="font-medium text-foreground">{successor?.title ?? memory.superseded_by}</span>
              {successor?.created && (
                <>
                  {" "}
                  · <RelTime iso={successor.created} now={now} />
                </>
              )}
            </Banner>
          )}
          {exp === "expired" && (
            <Banner
              tone="danger"
              icon={AlertTriangleIcon}
              action={
                <>
                  <Button variant="outline" size="xs" onClick={() => set({ expires: "30d" })}>
                    Extend 30d
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => set({ expires: "none" })}>
                    Never expire
                  </Button>
                </>
              }
            >
              Expired <RelTime iso={memory.expires} now={now} />. Hidden from the default list and from recall.
            </Banner>
          )}

          <div className="space-y-0.5 rounded-xl border bg-card/50 px-3 py-2">
            <PropRow label="Kind" icon={ShapesIcon}>
              <Select value={memory.kind} onValueChange={(v) => set({ kind: v as MemoryKind })}>
                <SelectTrigger size="sm" className="h-7 w-full max-w-48 border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted dark:bg-transparent">
                  <SelectValue>
                    <span className={cn("inline-flex items-center gap-1.5", kindMeta(memory.kind).text)}>
                      {(() => {
                        const M = kindMeta(memory.kind);
                        return <M.icon className="size-3.5" />;
                      })()}
                      {kindMeta(memory.kind).label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_KINDS.map((k) => {
                    const M = KIND_META[k];
                    return (
                      <SelectItem key={k} value={k}>
                        <M.icon className={M.text} /> {M.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </PropRow>
            <PropRow label="Importance" icon={GaugeIcon}>
              <div className="flex items-center gap-2 px-1">
                <ImportanceDots value={memory.importance} onChange={(importance) => set({ importance })} size="md" />
                <span className="text-xs text-muted-foreground tabular-nums">{memory.importance ?? "3 (default)"}</span>
              </div>
            </PropRow>
            <PropRow label="Visibility" icon={LockIcon}>
              <div className="inline-flex h-7 rounded-lg bg-muted p-0.5">
                {(["shared", "private"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => memory.scope !== s && set({ scope: s })}
                    className={cn("rounded-md px-2.5 text-xs font-medium capitalize", memory.scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </PropRow>
            <PropRow label="Author" icon={UserIcon}>
              <OwnerValue owner={memory.owner} />
            </PropRow>
            <PropRow label="Project" icon={FolderIcon}>
              <ProjectSelect value={memory.project} onChange={(project) => set({ project })} />
            </PropRow>
            <PropRow label="Expires" icon={CalendarClockIcon}>
              <ExpiryEditor memory={memory} now={now} onSet={(expires) => set({ expires })} />
            </PropRow>
            <PropRow label="Source" icon={LinkIcon}>
              <InlineInput value={memory.source ?? ""} placeholder="Where this came from" onSave={(v) => v.trim() && v !== memory.source && set({ source: v.trim() })} />
            </PropRow>
            <PropRow label="Tags" icon={HashIcon}>
              <TagEditor
                value={memory.tags}
                onChange={(next) => {
                  const spec = tagSpec.diff(memory.tags, next);
                  if (spec) set({ tags: spec });
                }}
              />
            </PropRow>
            <PropRow label="Updated" icon={ClockIcon}>
              <span className="px-1 text-xs text-muted-foreground">
                <RelTime iso={memory.updated} now={now} /> · created <RelTime iso={memory.created} now={now} />
              </span>
            </PropRow>
          </div>

          <BodySection memory={memory} loading={q.isLoading} />

          <Chain id={memory.id} all={all} onNavigate={onNavigate} />
        </div>
      </div>
      <MemoryDialog open={supersedeOpen} onOpenChange={setSupersedeOpen} supersede={memory} onCreated={(m) => onNavigate(m.id)} />
    </div>
  );
}

function PanelBar({ children, onClose }: { children?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {children}
      <Button variant="ghost" size="icon-sm" className={children ? "" : "ml-auto"} onClick={onClose} aria-label="Close">
        <XIcon />
      </Button>
    </div>
  );
}

function EditableTitle({ value, onSave, struck }: { value: string; onSave: (v: string) => void; struck?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className="field-sizing-content w-full resize-none rounded-md bg-transparent text-lg leading-snug font-semibold tracking-tight outline-none ring-2 ring-ring"
      />
    );
  }
  return (
    <h2
      className={cn("cursor-text rounded-md text-lg leading-snug font-semibold tracking-tight hover:bg-muted/50", struck && "line-through decoration-muted-foreground/50")}
      onClick={() => setDraft(value)}
      title="Click to edit"
    >
      {value}
    </h2>
  );
}

function OwnerValue({ owner }: { owner: string | null }) {
  const members = useMemberMap();
  if (!owner) return <span className="px-1 text-xs text-muted-foreground">—</span>;
  const m = members.get(owner);
  return (
    <span className="inline-flex items-center gap-1.5 px-1 text-[13px]">
      <MemberAvatar id={owner} size="sm" />
      {m?.name ?? owner}
      {m?.kind === "agent" && <span className="text-xs text-muted-foreground">agent</span>}
    </span>
  );
}

function ProjectSelect({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const projects = useProjects().data ?? [];
  const title = projects.find((p) => p.id === value)?.title ?? value;
  return (
    <Select value={value ?? NONE} onValueChange={(v) => v !== NONE && onChange(v)}>
      <SelectTrigger size="sm" className="h-7 w-full max-w-56 border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted dark:bg-transparent">
        <SelectValue>{value ? title : <span className="text-muted-foreground">No project</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {!value && <SelectItem value={NONE}>No project</SelectItem>}
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExpiryEditor({ memory, now, onSet }: { memory: Memory; now: Date; onSet: (v: string) => void }) {
  const [custom, setCustom] = useState(false);
  return (
    <div className="flex items-center gap-1.5 px-1">
      {memory.expires ? <ExpiryBadge expires={memory.expires} now={now} /> : <span className="text-xs text-muted-foreground">Never</span>}
      {custom ? (
        <InlineInput
          autoFocus
          value=""
          placeholder="7d, 2w, 2026-12-01"
          onSave={(v) => {
            if (v.trim()) onSet(v.trim());
            setCustom(false);
          }}
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="text-muted-foreground">
              Change
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onSet("7d")}>In 1 week</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSet("30d")}>In 30 days</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSet("90d")}>In 90 days</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCustom(true)}>Custom…</DropdownMenuItem>
            {memory.expires && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onSet("none")}>Never expire</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function InlineInput({ value, placeholder, onSave, autoFocus }: { value: string; placeholder?: string; onSave: (v: string) => void; autoFocus?: boolean }) {
  const [draft, setDraft] = useState(value);
  useRenderReset([value], () => setDraft(value));
  return (
    <input
      autoFocus={autoFocus}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none placeholder:text-muted-foreground/70 hover:bg-muted focus:border-ring focus:bg-background"
    />
  );
}

function BodySection({ memory, loading }: { memory: Memory; loading: boolean }) {
  const setBody = useSetMemoryBody();
  const append = useAppendMemory();
  const [mode, setMode] = useState<"view" | "edit" | "append">("view");
  const [draft, setDraft] = useState("");
  const [appendOnly, setAppendOnly] = useState(false);
  const body = memory.body ?? "";

  const startEdit = () => {
    setDraft(body);
    setMode(appendOnly ? "append" : "edit");
    if (appendOnly) setDraft("");
  };
  const save = () => {
    if (mode === "append") {
      if (!draft.trim()) return;
      append.mutate({ memory, text: draft, timestamp: true }, { onSuccess: () => setMode("view") });
      return;
    }
    if (draft === body) {
      setMode("view");
      return;
    }
    setBody.mutate(
      { memory, body: draft },
      {
        onSuccess: () => setMode("view"),
        onError: (e) => {
          if (isUnknownTool(e)) {
            setAppendOnly(true);
            toast.warning("This host can’t replace memory bodies yet", { description: "Your edit was kept in the editor. Append it as a new section instead." });
          }
        },
      },
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Details</h3>
        {mode === "view" && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                setDraft("");
                setMode("append");
              }}
            >
              <PlusIcon /> Append
            </Button>
            <Button id="memory-edit-body" variant="ghost" size="xs" className="text-muted-foreground" onClick={startEdit}>
              <PencilIcon /> Edit
              <Kbd keys="e" className="ml-0.5" />
            </Button>
          </div>
        )}
      </div>
      {mode === "view" ? (
        loading && !body ? (
          <Skeleton className="h-20 w-full" />
        ) : body.trim() ? (
          <div className="rounded-xl border bg-card/40 px-4 py-3">
            <Markdown>{body}</Markdown>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="w-full rounded-xl border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground hover:border-foreground/20 hover:bg-muted/40"
          >
            No details yet — add context, evidence or links.
          </button>
        )
      ) : (
        <div className="space-y-2">
          {mode === "edit" && appendOnly && (
            <Banner tone="warning" icon={AlertTriangleIcon}>
              This host can only append to memories. Switch to Append to add your text as a new section.
            </Banner>
          )}
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation();
                setMode("view");
              }
            }}
            placeholder={mode === "append" ? "Add to this memory (a timestamped section is appended)…" : "Markdown…"}
            className="min-h-40 font-mono text-[13px] leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              <Kbd keys="mod+enter" /> save · <Kbd keys="escape" /> cancel
            </span>
            <div className="ml-auto flex gap-1.5">
              {mode === "edit" && appendOnly && (
                <Button variant="outline" size="sm" onClick={() => setMode("append")}>
                  Append instead
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={setBody.isPending || append.isPending}>
                {mode === "append" ? "Append" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Chain({ id, all, onNavigate }: { id: string; all: Memory[]; onNavigate: (id: string) => void }) {
  const { chain, broken } = useMemo(() => supersessionChain(id, all), [id, all]);
  if (chain.length < 2 && !broken) return null;
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold">Supersession chain</h3>
      <ol className="relative space-y-0.5 pl-1">
        {chain.map((m, i) => {
          const current = m.id === id;
          const last = i === chain.length - 1 && !broken;
          return (
            <li key={m.id} className="relative flex items-start gap-3">
              <div className="flex flex-col items-center self-stretch pt-2">
                <span className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-background", current ? "bg-primary" : m.superseded_by ? "bg-muted-foreground/40" : "bg-success")} />
                {!last && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <button
                type="button"
                disabled={current}
                onClick={() => onNavigate(m.id)}
                className={cn("mb-1 min-w-0 flex-1 rounded-md px-2 py-1 text-left text-[13px] hover:bg-muted disabled:hover:bg-transparent", current && "bg-accent")}
              >
                <span className={cn("block truncate", m.superseded_by && "text-muted-foreground line-through decoration-muted-foreground/40", current && "font-medium")}>{m.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {m.id} · <RelTime iso={m.created} />
                </span>
              </button>
            </li>
          );
        })}
        {broken && (
          <li className="flex items-center gap-2 pl-0.5 text-xs text-warning">
            <AlertTriangleIcon className="size-3.5" /> Points at missing memory {broken}
          </li>
        )}
      </ol>
    </section>
  );
}
