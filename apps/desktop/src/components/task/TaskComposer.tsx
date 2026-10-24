/**
 * Inline "Add task" row (Todoist-style): a plus row that opens an editor using the quick-add
 * grammar. Enter adds and keeps the editor open for the next task; Esc closes.
 */
import { CornerDownLeftIcon, HashIcon, InboxIcon, PlusIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { LabelChip } from "@/components/shared/LabelChip";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/button";
import { entityColor } from "@/lib/color";
import { useMembers, useProjects } from "@/lib/hooks";
import { useCreateTask } from "@/lib/query";
import { parseQuickAdd, segments } from "@/lib/quickadd/parse";
import { resolveOwner } from "@/lib/quickadd/resolve";
import { TOKEN_CLS } from "@/lib/quickadd/token-tone";
import { describeRecur } from "@/lib/recur";
import type { Priority, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ComposerDefaults {
  project?: string | null;
  section?: string | null;
  due?: string | null;
  labels?: string[];
  parent?: string | null;
  priority?: Priority;
  /** Manual rank for the new task (append at the end of its group). */
  order?: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function resolveProjectName(name: string | null, projects: Project[]): Project | null {
  if (!name) return null;
  const n = norm(name);
  return (
    projects.find((p) => p.id === name) ??
    projects.find((p) => (p.slug ? norm(p.slug) === n : false)) ??
    projects.find((p) => norm(p.title) === n) ??
    projects.find((p) => norm(p.title).startsWith(n)) ??
    null
  );
}

export interface TaskComposerProps {
  defaults?: ComposerDefaults;
  /** Text on the collapsed row. */
  label?: string;
  /** Start open (e.g. "Add section" flow). */
  autoOpen?: boolean;
  /** Called on close (Esc / Cancel / blur when empty). */
  onClose?: () => void;
  className?: string;
  /** Indent in px (subtask composers). */
  indent?: number;
  compact?: boolean;
}

export function TaskComposer({ defaults = {}, label = "Add task", autoOpen, onClose, className, indent, compact }: TaskComposerProps) {
  const [open, setOpen] = useState(!!autoOpen);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={indent ? { paddingLeft: indent } : undefined}
        className={cn(
          "group/add flex w-full items-center gap-2.5 rounded-md py-2 text-left text-[13.5px] text-muted-foreground transition-colors hover:text-foreground",
          compact && "py-1.5 text-[13px]",
          className,
        )}
      >
        <span className="inline-flex size-[18px] items-center justify-center rounded-full text-foreground transition-colors group-hover/add:bg-primary group-hover/add:text-primary-foreground">
          <PlusIcon className="size-4" strokeWidth={2.2} />
        </span>
        {label}
      </button>
    );
  }
  return (
    <Editor
      defaults={defaults}
      indent={indent}
      className={className}
      onClose={() => {
        setOpen(false);
        onClose?.();
      }}
    />
  );
}

function Editor({ defaults, onClose, className, indent }: { defaults: ComposerDefaults; onClose: () => void; className?: string; indent?: number }) {
  const [text, setText] = useState("");
  const [desc, setDesc] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const projects = useProjects().data ?? [];
  const membersQ = useMembers().data;
  const members = membersQ ?? [];
  const create = useCreateTask({ quiet: true });
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const segs = useMemo(() => segments(text, parsed.tokens), [text, parsed.tokens]);
  const parsedProject = resolveProjectName(parsed.project, projects);
  const projectId = parsedProject?.id ?? defaults.project ?? null;
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  const due = parsed.due ?? defaults.due ?? null;
  const priority = parsed.priority ?? defaults.priority ?? null;
  const labels = [...new Set([...(defaults.labels ?? []), ...parsed.labels])];
  const section = parsed.section ?? (parsedProject && parsedProject.id !== defaults.project ? null : (defaults.section ?? null));
  const ownerRaw = parsed.owner;
  // Members are config-only: an assignee that names nobody blocks the submit (see QuickAddForm).
  const ownerRes = resolveOwner(ownerRaw, members);
  const owner = ownerRes.status === "resolved" ? ownerRes.member : null;
  const ownerBlocked = ownerRes.status === "unknown" || ownerRes.status === "ambiguous";
  const ownerProblem = membersQ !== undefined && ownerBlocked ? ownerRes : null;
  // A new task must sort after existing ones; bump for each task added in this session.
  const [added, setAdded] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const title = parsed.title.trim();
  const submit = async () => {
    if (!title || create.isPending) return;
    if (ownerBlocked) {
      if (ownerProblem) toast.warning(`No member “${ownerProblem.raw}”. Fix or remove the assignee.`);
      return;
    }
    if (parsed.project && !parsedProject) toast.warning(`No project “${parsed.project}” — added to ${project?.title ?? "Inbox"}.`);
    try {
      await create.mutateAsync({
        title,
        priority: priority ?? undefined,
        tags: labels.length ? labels : undefined,
        owner: owner?.id ?? undefined,
        project: projectId ?? undefined,
        body: desc.trim() ? `${desc.trim()}\n` : undefined,
        due: due ?? undefined,
        deadline: parsed.deadline ?? undefined,
        recur: parsed.recur ?? undefined,
        recur_from: parsed.recur ? (parsed.recur_from ?? "due") : undefined,
        section: section ?? undefined,
        parent: defaults.parent ?? undefined,
        order: typeof defaults.order === "number" ? defaults.order + added : undefined,
      });
    } catch {
      return; // the mutation cache shows the error
    }
    setAdded((n) => n + 1);
    setText("");
    setDesc("");
    ref.current?.focus();
  };

  const chips = [
    due && <DueChip key="due" due={due} recur={parsed.recur} recurFrom={parsed.recur_from} variant="pill" />,
    !due && parsed.recur && (
      <span key="recur" className="rounded-md bg-due-today/10 px-1.5 py-0.5 text-xs text-due-today">
        {describeRecur(parsed.recur, parsed.recur_from)}
      </span>
    ),
    parsed.deadline && <DeadlineChip key="dl" deadline={parsed.deadline} className="rounded-md bg-muted px-1.5 py-0.5" />,
    priority && <PriorityFlag key="p" priority={priority} withLabel hideLow={false} className="rounded-md bg-muted px-1.5 py-0.5" />,
    ...labels.map((l) => <LabelChip key={`l-${l}`} name={l} link={false} size="md" />),
    owner && (
      <span key="o" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
        <Avatar id={owner.id} name={owner.name} kind={owner.kind} size="xs" />
        {owner.name}
      </span>
    ),
    ownerProblem && (
      <span key="o-x" className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
        {ownerProblem.status === "ambiguous" ? `“${ownerProblem.raw}” matches several members` : `No member ‘${ownerProblem.raw}’`}
      </span>
    ),
    parsed.warning && (
      <span key="warn" className="rounded-md bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
        {parsed.warning}
      </span>
    ),
  ].filter(Boolean);

  return (
    <div
      ref={wrap}
      style={indent ? { marginLeft: indent } : undefined}
      onBlur={(e) => {
        if (!text.trim() && !desc.trim() && !wrap.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
      className={cn(
        "my-1.5 rounded-xl border bg-background shadow-elevation-1 transition-shadow focus-within:border-foreground/20 focus-within:shadow-elevation-1",
        className,
      )}
    >
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative text-[14px] leading-5 font-medium">
          <div aria-hidden className="pointer-events-none absolute inset-0 break-words whitespace-pre-wrap">
            {segs.map((s, i) =>
              s.token ? (
                <span key={i} className={cn("-mx-px rounded-[3px] px-px", TOKEN_CLS[s.token.kind])}>
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
            {"​"}
          </div>
          <textarea
            ref={ref}
            autoFocus
            rows={1}
            value={text}
            spellCheck={false}
            aria-label="Task name"
            placeholder="Task name"
            onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            className="relative block w-full resize-none overflow-hidden bg-transparent break-words whitespace-pre-wrap text-transparent caret-foreground outline-none selection:bg-primary/25 placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        </div>
        <textarea
          rows={1}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Description"
          className="mt-0.5 block w-full resize-none bg-transparent text-[13px] leading-5 text-foreground/85 outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-1.5 flex min-h-6 flex-wrap items-center gap-1.5">
          {chips.length ? chips : <span className="text-[11.5px] text-muted-foreground">tomorrow 5pm · p1 · @label · #project · /section · every mon · {"{deadline}"}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2.5 py-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
          {project ? <HashIcon className="size-3.5" style={{ color: entityColor(project.id, project.color) }} /> : <InboxIcon className="size-3.5 text-foreground" />}
          <span className="truncate">{project?.title ?? (projectId || "Inbox")}</span>
          {section && <span className="truncate text-muted-foreground">/ {section}</span>}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={!title || create.isPending || ownerBlocked} className="gap-1.5">
            Add task <CornerDownLeftIcon className="size-3.5 opacity-70" />
          </Button>
        </div>
      </div>
    </div>
  );
}
