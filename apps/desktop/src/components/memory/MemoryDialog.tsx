/** New memory / "Supersede…" dialog. Supersede = a new memory with `supersedes: <old id>`. */
import { ReplaceIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/Avatar";
import { Kbd } from "@/components/shared/Kbd";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MemoryNewArgs } from "@/lib/api";
import { useMe, useMembers, useProjects } from "@/lib/hooks";
import { MEMORY_KINDS, type Memory, type MemoryKind, type MemoryScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TagEditor } from "@/components/note/TagEditor";
import { ImportanceDots, KIND_META } from "./badges";
import { useCreateMemory } from "./hooks";
import { useRenderReset } from "@/hooks/use-render-reset";

const EXPIRY_PRESETS = [
  { value: "never", label: "Never" },
  { value: "1d", label: "In 1 day" },
  { value: "7d", label: "In 1 week" },
  { value: "30d", label: "In 30 days" },
  { value: "90d", label: "In 90 days" },
  { value: "custom", label: "Custom…" },
];

const NONE = "__none__";

export function MemoryDialog({
  open,
  onOpenChange,
  supersede,
  onCreated,
  defaults,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Prefill from this memory and mark it superseded by the new one. */
  supersede?: Memory | null;
  onCreated?: (m: Memory) => void;
  defaults?: Partial<Pick<Memory, "project" | "owner" | "kind">>;
  /** Prefill fields for a brand-new memory (e.g. "Promote scratch to memory"). */
  prefill?: Partial<Pick<Memory, "title" | "body" | "source" | "owner" | "tags" | "kind">> | null;
}) {
  const me = useMe();
  const members = useMembers().data ?? [];
  const projects = useProjects().data ?? [];
  const create = useCreateMemory();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MemoryKind>("fact");
  const [scope, setScope] = useState<MemoryScope>("shared");
  const [importance, setImportance] = useState(3);
  const [expiry, setExpiry] = useState("never");
  const [customExpiry, setCustomExpiry] = useState("");
  const [source, setSource] = useState("");
  const [project, setProject] = useState<string>(NONE);
  const [owner, setOwner] = useState<string>(NONE);
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");

  useRenderReset([open, supersede, prefill, defaults?.kind, defaults?.project, defaults?.owner, me], () => {
    if (!open) return;
    const s = supersede ?? (prefill as Memory | null | undefined);
    setTitle(s?.title ?? "");
    setKind(((s?.kind ?? defaults?.kind) as MemoryKind) in KIND_META ? ((s?.kind ?? defaults?.kind) as MemoryKind) : "fact");
    setScope(s?.scope === "private" ? "private" : "shared");
    setImportance(s?.importance ?? 3);
    setExpiry("never");
    setCustomExpiry("");
    setSource(s?.source ?? "");
    setProject(s?.project ?? defaults?.project ?? NONE);
    setOwner(s?.owner ?? defaults?.owner ?? me ?? NONE);
    setTags(s?.tags ?? []);
    setBody(s?.body?.trim() ?? "");
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    const args: MemoryNewArgs = {
      title: title.trim(),
      kind,
      scope,
      importance,
      tags: tags.length ? tags : undefined,
      body: body.trim() ? body : undefined,
      source: source.trim() || undefined,
      project: project !== NONE ? project : undefined,
      owner: owner !== NONE ? owner : undefined,
      expires: expiry === "never" ? undefined : expiry === "custom" ? customExpiry.trim() || undefined : expiry,
      supersedes: supersede?.id,
    };
    create.mutate(args, {
      onSuccess: (m) => {
        toast.success(supersede ? `Replaced “${supersede.title}”` : `Remembered “${m.title}”`, {
          description: supersede ? "The old memory is kept for audit and no longer recalled." : undefined,
        });
        onOpenChange(false);
        onCreated?.(m);
      },
    });
  };

  const ownerOptions = [...new Map(members.map((m) => [m.id, m])).values()];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <form onSubmit={submit} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}>
          <DialogHeader className="border-b px-5 pt-5 pb-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              {supersede && <ReplaceIcon className="size-4 text-primary" />}
              {supersede ? "Supersede memory" : "New memory"}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {supersede ? (
                <>
                  Write the corrected version. <span className="font-medium text-foreground">“{supersede.title}”</span> stays on disk for audit but drops out of recall.
                </>
              ) : (
                "Memories are what agents recall at session start and on demand — ranked by match, importance and recency."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should be remembered?" className="h-9 text-[15px] font-medium" />
            <div>
              <FieldLabel>Kind</FieldLabel>
              <div className="grid grid-cols-5 gap-1.5">
                {MEMORY_KINDS.map((k) => {
                  const m = KIND_META[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      title={m.description}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        kind === k ? "border-primary/50 bg-primary/6 text-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className={cn("grid size-6 place-items-center rounded-md", m.tile)}>
                        <m.icon className="size-3.5" />
                      </span>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Importance</FieldLabel>
                <div className="flex h-8 items-center gap-2">
                  <ImportanceDots value={importance} onChange={setImportance} size="md" />
                  <span className="text-xs text-muted-foreground tabular-nums">{importance}/5</span>
                </div>
              </div>
              <div>
                <FieldLabel>Visibility</FieldLabel>
                <div className="inline-flex h-8 rounded-lg bg-muted p-0.5">
                  {(["shared", "private"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className={cn("rounded-md px-3 text-xs font-medium capitalize", scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Author</FieldLabel>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Default (me)</SelectItem>
                    {ownerOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <Avatar id={m.id} kind={m.kind} name={m.name} size="xs" /> {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Project</FieldLabel>
                <Select value={project} onValueChange={setProject}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Expires</FieldLabel>
                <div className="flex gap-1.5">
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {expiry === "custom" && <Input value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} placeholder="2w or 2026-12-01" className="h-7 text-xs" />}
                </div>
              </div>
              <div>
                <FieldLabel>Source</FieldLabel>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="PR #12, session, URL…" className="h-7 text-[13px]" />
              </div>
            </div>
            <div>
              <FieldLabel>Tags</FieldLabel>
              <TagEditor value={tags} onChange={setTags} />
            </div>
            <div>
              <FieldLabel>Details</FieldLabel>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Markdown. Context, evidence, links to [[notes]]…" className="min-h-28 font-mono text-[13px]" />
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 items-center px-5 py-3">
            <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Kbd keys="mod+enter" /> to save
            </span>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {supersede ? "Save replacement" : "Remember"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <div className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}
