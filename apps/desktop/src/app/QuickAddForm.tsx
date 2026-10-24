import { addDays, nextSaturday, startOfDay } from "date-fns";
import {
  CalendarIcon,
  CalendarOffIcon,
  CalendarRangeIcon,
  ChevronDownIcon,
  CornerDownLeftIcon,
  FlagIcon,
  HashIcon,
  InboxIcon,
  LayoutListIcon,
  TagIcon,
  RepeatIcon,
  SofaIcon,
  SunIcon,
  SunriseIcon,
  TextIcon,
  TriangleAlertIcon,
  UserXIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/Avatar";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { Kbd } from "@/components/shared/Kbd";
import { LabelChip } from "@/components/shared/LabelChip";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { entityColor } from "@/lib/color";
import { formatDue, parseDue, toDateKey } from "@/lib/dates";
import { useLabels, useMembers, useProjectCounts, useProjects } from "@/lib/hooks";
import { PRIORITY_META } from "@/lib/priority";
import { useCreateTask } from "@/lib/query";
import { parseQuickAdd, segments, type NameKind, type Token, type TokenKind } from "@/lib/quickadd/parse";
import { resolveOwner } from "@/lib/quickadd/resolve";
import { TOKEN_CLS } from "@/lib/quickadd/token-tone";
import { activeTrigger, anyPrefix, applyCandidate, rankCandidates, type Candidate } from "@/lib/quickadd/suggest";
import { describeRecur } from "@/lib/recur";
import type { Priority, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { QuickAddDefaults } from "./quickadd-store";
import { resolveProject, resolveQuickAddSubmit, type Overrides } from "./quickadd-submit";
import { useNow } from "@/lib/now";

function tokenClass(t: Token) {
  if (t.kind === "priority") {
    const m = PRIORITY_META[t.value as Priority];
    return m ? m.text : TOKEN_CLS.priority;
  }
  return TOKEN_CLS[t.kind];
}

function Chip({ children, onRemove, className, title }: { children: ReactNode; onRemove?: () => void; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "group/chip inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-foreground/90 shadow-xs",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="-mr-1 rounded-sm p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}

function DatePicker({ due, onPick }: { due: string | null; onPick: (due: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const p = parseDue(due);
  const today = startOfDay(useNow());
  const pick = (d: Date | null) => {
    setOpen(false);
    if (!d) return onPick(null);
    onPick(p?.hasTime ? formatDue(new Date(d.getFullYear(), d.getMonth(), d.getDate(), p.date.getHours(), p.date.getMinutes()), true) : toDateKey(d));
  };
  const quick: [string, Date | null, typeof SunIcon, string][] = [
    ["Today", today, SunIcon, "text-due-today"],
    ["Tomorrow", addDays(today, 1), SunriseIcon, "text-due-tomorrow"],
    ["This weekend", nextSaturday(today), SofaIcon, "text-priority-normal"],
    ["Next week", addDays(today, 7), CalendarRangeIcon, "text-due-week"],
    ["No date", null, CalendarOffIcon, "text-muted-foreground"],
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 font-normal", !due && "text-muted-foreground")}>
          {due ? <DueChip due={due} /> : (
            <>
              <CalendarIcon /> Date
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col border-b p-1">
          {quick.map(([label, d, Icon, cls]) => (
            <button
              key={label}
              type="button"
              onClick={() => pick(d)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Icon className={cn("size-4", cls)} />
              {label}
              {d && <span className="ml-auto text-xs text-muted-foreground">{d.toDateString().slice(0, 3)}</span>}
            </button>
          ))}
        </div>
        <Calendar mode="single" selected={p?.date} onSelect={(d) => d && pick(d)} defaultMonth={p?.date ?? today} weekStartsOn={1} />
      </PopoverContent>
    </Popover>
  );
}

function PriorityPicker({ value, onPick }: { value: Priority | null; onPick: (p: Priority) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 font-normal", !value && "text-muted-foreground")}>
          {value ? <PriorityFlag priority={value} hideLow={false} withLabel /> : (
            <>
              <FlagIcon /> Priority
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {(["urgent", "high", "normal", "low"] as Priority[]).map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onPick(p)} className="gap-2">
            <PriorityFlag priority={p} hideLow={false} />
            <span>{PRIORITY_META[p].label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{PRIORITY_META[p].short.toLowerCase()}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectPicker({ value, projects, onPick }: { value: Project | null; projects: Project[]; onPick: (id: string | null) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 font-medium">
          {value ? <HashIcon style={{ color: entityColor(value.id, value.color) }} /> : <InboxIcon className="text-foreground" />}
          <span className="max-w-48 truncate">{value?.title ?? "Inbox"}</span>
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56">
        <DropdownMenuItem onSelect={() => onPick(null)} className="gap-2">
          <InboxIcon className="text-foreground" /> Inbox
        </DropdownMenuItem>
        {projects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
          </>
        )}
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onPick(p.id)} className="gap-2">
            <HashIcon style={{ color: entityColor(p.id, p.color) }} />
            <span className="truncate">{p.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The Quick Add form (lazy-loaded: pulls in chrono-node and the calendar). */
export function QuickAddForm({ defaults, onDone }: { defaults: QuickAddDefaults; onDone: () => void }) {
  const [text, setText] = useState(defaults.text ?? "");
  const [desc, setDesc] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [over, setOver] = useState<Overrides>({});
  const [dropped, setDropped] = useState<{ labels: string[] }>({ labels: [] });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const projectsQ = useProjects().data;
  const membersQ = useMembers().data;
  const projects = useMemo(() => (projectsQ ?? []).filter((p) => !p.archived), [projectsQ]);
  const members = useMemo(() => membersQ ?? [], [membersQ]);
  const labelInfo = useLabels();
  const projectCounts = useProjectCounts();
  const create = useCreateTask();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  /** Autocomplete candidates per sigil; the parser also uses their names to keep multi-word names whole. */
  const candidates = useMemo<Record<NameKind, Candidate[]>>(() => {
    const sections = [...new Set([...(defaults.section ? [defaults.section] : []), ...projects.flatMap((p) => p.sections)])];
    const labels = [...new Set([...labelInfo.map((l) => l.name), ...(defaults.labels ?? [])])];
    return {
      project: projects.map((p) => ({ key: p.id, label: p.title, insert: p.title, aliases: p.slug ? [p.slug] : [], hint: (projectCounts?.get(p.id) ?? p.open_count) ? String(projectCounts?.get(p.id) ?? p.open_count) : undefined })),
      section: sections.map((s) => ({ key: s, label: s, insert: s })),
      label: labels.map((l) => ({ key: l, label: l, insert: l })),
      owner: members.map((m) => ({
        key: m.id,
        label: m.name || m.id,
        // Ids carry no spaces; names may. Insert the id so the token is unambiguous.
        insert: /\s/.test(m.id) ? m.name : m.id,
        aliases: [m.id, m.name],
        hint: m.kind === "agent" ? "agent" : m.id !== m.name ? m.id : undefined,
      })),
    };
  }, [projects, members, labelInfo, projectCounts, defaults.section, defaults.labels]);
  const known = useMemo(
    () => ({
      project: candidates.project.map((c) => c.insert),
      section: candidates.section.map((c) => c.insert),
      label: candidates.label.map((c) => c.insert),
      owner: [...new Set(members.flatMap((m) => [m.id, m.name]).filter(Boolean))],
    }),
    [candidates, members],
  );

  const parsed = useMemo(() => parseQuickAdd(text, { known }), [text, known]);
  const segs = useMemo(() => segments(text, parsed.tokens), [text, parsed.tokens]);

  const parsedProject = resolveProject(parsed.project, projects);
  const projectId = over.project !== undefined ? over.project : (parsedProject?.id ?? defaults.project ?? null);
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? { id: projectId, title: projectId, sections: [], open_count: 0 }) : null;
  const due = over.due !== undefined ? over.due : (parsed.due ?? defaults.due ?? null);
  const priority = over.priority !== undefined ? over.priority : (parsed.priority ?? defaults.priority ?? null);
  const labels = [...new Set([...(defaults.labels ?? []), ...parsed.labels])].filter((l) => !dropped.labels.includes(l));
  const ownerRaw = parsed.owner ?? defaults.owner ?? null;
  const ownerRes = resolveOwner(ownerRaw, members);
  const owner = ownerRes.status === "resolved" ? ownerRes.member : null;
  // Members are config-only: an assignee that names nobody blocks the submit (Enter included)
  // until the token is fixed or removed. While members load, nothing is flagged yet.
  const membersLoaded = membersQ !== undefined;
  const ownerBlocked = ownerRes.status !== "none" && ownerRes.status !== "resolved";
  const ownerProblem = membersLoaded && ownerBlocked ? ownerRes : null;
  const section = parsed.section ?? defaults.section ?? null;

  // Sections of the chosen project come first in the `/` list (all known sections still parse).
  const projectSections = project && "sections" in project ? project.sections : [];
  const pool = useMemo<Record<NameKind, Candidate[]>>(() => {
    if (!projectSections.length) return candidates;
    const own = projectSections.map((x) => ({ key: x, label: x, insert: x, hint: "this project" }));
    return { ...candidates, section: [...own, ...candidates.section.filter((c) => !projectSections.includes(c.insert))] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, projectSections.join("\u0000")]);
  const trigger = useMemo(() => activeTrigger(text, caret, (kind, q) => anyPrefix(pool[kind], q)), [text, caret, pool]);
  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const ranked = rankCandidates(pool[trigger.kind], trigger.query, 50);
    // Keep the project's own sections ahead of equally good matches elsewhere.
    if (trigger.kind === "section" && projectSections.length) ranked.sort((a, b) => Number(!!b.hint) - Number(!!a.hint));
    return ranked.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, pool]);
  const suggestOpen = !!trigger && suggestions.length > 0 && dismissedAt !== trigger.start;
  const activeIdx = Math.min(active, Math.max(0, suggestions.length - 1));

  // auto-grow
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const removeToken = (kinds: TokenKind[], value?: string) => {
    const toks = parsed.tokens.filter((t) => kinds.includes(t.kind) && (value === undefined || t.value === value));
    if (!toks.length) return false;
    let next = text;
    for (const t of [...toks].sort((a, b) => b.start - a.start)) next = next.slice(0, t.start) + next.slice(t.end);
    setText(next.replace(/\s{2,}/g, " "));
    return true;
  };

  const title = parsed.title.trim();

  const syncCaret = (el: HTMLTextAreaElement) => {
    if (el.selectionStart === el.selectionEnd) setCaret(el.selectionStart);
  };

  const choose = (c: Candidate) => {
    if (!trigger) return;
    const next = applyCandidate(text, caret, trigger, c);
    if (trigger.kind === "project") setOver((o) => ({ ...o, project: undefined }));
    setText(next.text);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async (keepOpen: boolean) => {
    if (!title || create.isPending) return;
    const result = resolveQuickAddSubmit({
      text,
      known,
      over,
      droppedLabels: dropped.labels,
      defaults,
      projects,
      members,
      description: desc,
    });
    if (result.blocked) {
      if (membersLoaded) {
        const { status, raw } = result.blocked;
        toast.warning(status === "ambiguous" ? `“${raw}” matches several members — pick one.` : `No member “${raw}”. Fix or remove the assignee.`);
      }
      return;
    }
    for (const warning of result.warnings) toast.warning(warning);
    if (!result.ok || !result.args) return;
    try {
      await create.mutateAsync(result.args);
    } catch {
      return; // error toast comes from the mutation cache
    }
    if (keepOpen) {
      setText("");
      setDesc("");
      setOver((o) => ({ project: o.project }));
      setDropped({ labels: [] });
      inputRef.current?.focus();
    } else {
      onDone();
    }
  };

  const hasChips = !!(parsed.recur || parsed.warning || parsed.deadline || labels.length || owner || ownerRaw || section);

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2">
        {/* highlighted input: overlay renders colored tokens, textarea on top has transparent text */}
        <Popover open={suggestOpen} onOpenChange={(o) => !o && setDismissedAt(trigger?.start ?? null)}>
        <PopoverAnchor asChild>
          <div className="relative text-[15px] leading-6 font-medium">
            <div aria-hidden className="pointer-events-none absolute inset-0 break-words whitespace-pre-wrap">
              {segs.map((s, i) =>
                s.token ? (
                  <span key={i} className={cn("qa-token -mx-px px-px", tokenClass(s.token))}>
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
              {"​"}
            </div>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              spellCheck={false}
              aria-label="Task name"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestOpen}
              aria-controls={suggestOpen ? "qa-suggest" : undefined}
              aria-activedescendant={suggestOpen ? `qa-suggest-${activeIdx}` : undefined}
              data-qa-suggest-open={suggestOpen ? "" : undefined}
              placeholder="e.g. Review PR #project p1 tomorrow 5pm @label +agent"
              onChange={(e) => {
                setText(e.target.value.replace(/\n/g, " "));
                syncCaret(e.currentTarget);
                setActive(0);
              }}
              onSelect={(e) => syncCaret(e.currentTarget)}
              onBlur={() => setDismissedAt(null)}
              onKeyDown={(e) => {
                if (suggestOpen && !e.nativeEvent.isComposing) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const d = e.key === "ArrowDown" ? 1 : -1;
                    setActive((activeIdx + d + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    choose(suggestions[activeIdx]);
                    return;
                  }
                  if (e.key === "Escape") {
                    // The dialog ignores this Escape (QuickAdd checks data-qa-suggest-open).
                    e.preventDefault();
                    setDismissedAt(trigger?.start ?? null);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit(e.shiftKey);
                }
              }}
              className="relative block w-full resize-none overflow-hidden bg-transparent break-words whitespace-pre-wrap text-transparent caret-foreground outline-none selection:bg-primary/25 selection:text-transparent placeholder:font-normal placeholder:text-muted-foreground/70"
            />
          </div>
        </PopoverAnchor>
        {suggestOpen && trigger && (
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-72 p-1"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (e.target === inputRef.current) e.preventDefault();
            }}
          >
            <SuggestList kind={trigger.kind} items={suggestions} active={activeIdx} onHover={setActive} onPick={choose} projects={projects} members={members} />
          </PopoverContent>
        )}
        </Popover>
        {showDesc ? (
          <textarea
            autoFocus
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit(e.shiftKey);
              }
            }}
            placeholder="Description"
            className="mt-1 block w-full resize-none bg-transparent text-sm text-foreground/90 outline-none placeholder:text-muted-foreground/70"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowDesc(true)}
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <TextIcon className="size-3.5" /> Description
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <DatePicker
          due={due}
          onPick={(d) => {
            removeToken(["due"]);
            setOver((o) => ({ ...o, due: d }));
          }}
        />
        <PriorityPicker
          value={priority}
          onPick={(p) => {
            removeToken(["priority"]);
            setOver((o) => ({ ...o, priority: p }));
          }}
        />
        {parsed.recur && (
          <Chip onRemove={() => removeToken(["recur"])} title={parsed.recur} className="text-due-today">
            <RepeatIcon className="size-3" />
            {describeRecur(parsed.recur, parsed.recur_from)}
          </Chip>
        )}
        {parsed.warning && (
          <Chip className="border-warning/40 bg-warning/10 text-warning" title="Supported: every day / weekday / 2 weeks / mon, wed / month on the 1st …">
            <TriangleAlertIcon className="size-3.5" />
            {parsed.warning}
          </Chip>
        )}
        {parsed.deadline && (
          <Chip onRemove={() => removeToken(["deadline"])}>
            <DeadlineChip deadline={parsed.deadline} />
          </Chip>
        )}
        {owner ? (
          <Chip onRemove={() => removeToken(["owner"])}>
            <Avatar id={owner.id} kind={owner.kind} name={owner.name} color={owner.color} size="xs" />
            {owner.name}
          </Chip>
        ) : ownerProblem ? (
          <Chip
            onRemove={() => removeToken(["owner"])}
            className="border-destructive/40 bg-destructive/8 text-destructive"
            title={ownerProblem.status === "ambiguous" ? ownerProblem.matches.map((m) => m.name || m.id).join(", ") : "Members come from the Shards config"}
          >
            <UserXIcon className="size-3.5" />
            {ownerProblem.status === "ambiguous" ? `“${ownerProblem.raw}” matches ${ownerProblem.matches.length} members` : `No member ‘${ownerProblem.raw}’`}
          </Chip>
        ) : null}
        {section && (
          <Chip onRemove={() => removeToken(["section"])}>
            <span className="text-muted-foreground">/</span>
            {section}
          </Chip>
        )}
        {labels.map((l) => (
          <Chip
            key={l}
            onRemove={() => {
              if (!removeToken(["label"], l)) setDropped((d) => ({ labels: [...d.labels, l] }));
            }}
          >
            <LabelChip name={l} link={false} />
          </Chip>
        ))}
        {!hasChips && !text && <span className="ml-1 text-xs text-muted-foreground">Type # project · @ label · p1 · + assignee · every … · {"{deadline}"}</span>}
      </div>

      <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2">
        <ProjectPicker
          value={project}
          projects={projects}
          onPick={(id) => {
            removeToken(["project"]);
            setOver((o) => ({ ...o, project: id }));
          }}
        />
        {parsed.project && !parsedProject && over.project === undefined && (
          <span className="text-xs text-warning">No project “{parsed.project}”</span>
        )}
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
          <Kbd keys="shift+enter" /> add another
        </span>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void submit(false)} disabled={!title || create.isPending || ownerBlocked} className="gap-1.5">
          Add task
          <CornerDownLeftIcon className="size-3.5 opacity-70" />
        </Button>
      </div>
    </div>
  );
}


const KIND_LABEL: Record<NameKind, string> = { project: "Projects", section: "Sections", label: "Labels", owner: "Assignees" };

/** The quick-add autocomplete list (rendered under the input; keyboard lives on the textarea). */
function SuggestList({
  kind,
  items,
  active,
  onHover,
  onPick,
  projects,
  members,
}: {
  kind: NameKind;
  items: Candidate[];
  active: number;
  onHover: (i: number) => void;
  onPick: (c: Candidate) => void;
  projects: Project[];
  members: { id: string; kind: "human" | "agent"; name: string; color?: string | null }[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={listRef}
      id="qa-suggest"
      role="listbox"
      aria-label={KIND_LABEL[kind]}
      className="max-h-64 overflow-y-auto text-sm"
    >
      <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{KIND_LABEL[kind]}</div>
      {items.map((c, i) => {
        const p = kind === "project" ? projects.find((x) => x.id === c.key) : undefined;
        const m = kind === "owner" ? members.find((x) => x.id === c.key) : undefined;
        return (
          <div
            key={c.key}
            id={`qa-suggest-${i}`}
            data-idx={i}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => i !== active && onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c);
            }}
            className={cn("flex cursor-default items-center gap-2 rounded-md px-2 py-1.5", i === active && "bg-accent text-accent-foreground")}
          >
            {kind === "project" && <HashIcon className="size-4 shrink-0" style={{ color: p ? entityColor(p.id, p.color) : undefined }} />}
            {kind === "section" && <LayoutListIcon className="size-4 shrink-0 text-muted-foreground" />}
            {kind === "label" && <TagIcon className="size-4 shrink-0 text-muted-foreground" />}
            {kind === "owner" && <Avatar id={c.key} kind={m?.kind} name={m?.name} color={m?.color} size="xs" />}
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {c.hint && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{c.hint}</span>}
          </div>
        );
      })}
    </div>
  );
}
