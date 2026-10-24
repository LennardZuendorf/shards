/**
 * Field pickers shared by rows, cards and the detail pane: schedule (quick picks, natural
 * language, calendar, time), priority, labels, members, projects/sections, recurrence and tasks.
 * Each is popover *content*; callers own the trigger.
 */
import { addDays, format, nextMonday, nextSaturday, startOfDay } from "date-fns";
import {
  ArmchairIcon,
  CalendarArrowUpIcon,
  CalendarOffIcon,
  CheckIcon,
  ClockIcon,
  HashIcon,
  InboxIcon,
  PlusIcon,
  RepeatIcon,
  SunIcon,
  SunriseIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { DueChip } from "@/components/shared/DueChip";
import { LabelChip } from "@/components/shared/LabelChip";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { entityColor } from "@/lib/color";
import { formatDue, moveDueToDay, parseDue, toDateKey } from "@/lib/dates";
import { useLabels, useMembers, useProjects, useTasks } from "@/lib/hooks";
import { PRIORITIES, type Priority, type Project, type RecurFrom, type Task } from "@/lib/types";
import { PRIORITY_META } from "@/lib/priority";
import { parseQuickAdd } from "@/lib/quickadd/parse";
import { describeRecur } from "@/lib/recur";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/now";

/* -------------------------------------------------------------- schedule */

export interface QuickDate {
  label: string;
  date: Date | null;
  icon: typeof SunIcon;
  tone: string;
}

export function quickDates(now: Date = new Date()): QuickDate[] {
  const today = startOfDay(now);
  const sat = now.getDay() === 6 || now.getDay() === 0 ? today : nextSaturday(today);
  return [
    { label: "Today", date: today, icon: SunIcon, tone: "text-due-today" },
    { label: "Tomorrow", date: addDays(today, 1), icon: SunriseIcon, tone: "text-due-tomorrow" },
    { label: "This weekend", date: sat, icon: ArmchairIcon, tone: "text-priority-normal" },
    { label: "Next week", date: nextMonday(today), icon: CalendarArrowUpIcon, tone: "text-due-week" },
    { label: "No date", date: null, icon: CalendarOffIcon, tone: "text-muted-foreground" },
  ];
}

export interface ScheduleContentProps {
  due: string | null | undefined;
  onPick: (due: string | null) => void;
  /** When given, the natural-language box also accepts "every …" and a repeat row shows. */
  recur?: string | null;
  recurFrom?: RecurFrom | null;
  onRecur?: (recur: string | null, from?: RecurFrom | null) => void;
  /** Close the surrounding popover. */
  onDone?: () => void;
}

/** Todoist-style date picker: type a date, pick a shortcut, the calendar or a time. */
export function ScheduleContent({ due, onPick, recur, recurFrom, onRecur, onDone }: ScheduleContentProps) {
  const [text, setText] = useState("");
  const [timeOpen, setTimeOpen] = useState(false);
  const p = parseDue(due);
  const now = useNow();
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text.trim()) : null), [text]);
  const done = () => onDone?.();

  const pickDay = (d: Date | null) => {
    onPick(d ? moveDueToDay(due, d) : null);
    done();
  };

  const applyText = () => {
    if (!parsed) return;
    if (parsed.recur && onRecur) onRecur(parsed.recur, parsed.recur_from);
    if (parsed.due) onPick(parsed.due);
    if (parsed.due || parsed.recur) {
      setText("");
      done();
    }
  };

  const setTime = (hhmm: string | null) => {
    const base = p?.date ?? startOfDay(now);
    if (!hhmm) {
      onPick(toDateKey(base));
      return;
    }
    const [h, m] = hhmm.split(":").map(Number);
    onPick(formatDue(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m), true));
  };

  return (
    <div className="w-[264px]">
      <div className="border-b p-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyText();
            }
          }}
          placeholder={onRecur ? "Type a date… e.g. fri 9am, every mon" : "Type a date… e.g. next fri 9am"}
          className="h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
        {parsed && (
          <div className="mt-1.5 flex min-h-5 items-center gap-2 px-0.5 text-xs">
            {parsed.due || parsed.recur ? (
              <>
                {parsed.due && <DueChip due={parsed.due} recur={onRecur ? parsed.recur : null} />}
                {parsed.recur && onRecur && <span className="text-muted-foreground">{describeRecur(parsed.recur, parsed.recur_from)}</span>}
                <span className="ml-auto text-[10.5px] text-muted-foreground">↵ to apply</span>
              </>
            ) : (
              <span className="text-muted-foreground">No date recognised</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col p-1">
        {quickDates(now).map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => pickDay(q.date)}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <q.icon className={cn("size-4", q.tone)} />
            {q.label}
            {q.date && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{format(q.date, "EEE d MMM")}</span>}
          </button>
        ))}
      </div>
      <div className="border-t">
        <Calendar
          mode="single"
          selected={p?.date}
          onSelect={(d) => d && pickDay(d)}
          defaultMonth={p?.date ?? now}
          weekStartsOn={1}
          className="mx-auto [--cell-size:--spacing(8)]"
        />
      </div>
      <div className="flex items-center gap-1 border-t p-1.5">
        {timeOpen || p?.hasTime ? (
          <div className="flex flex-1 items-center gap-2 px-1">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            <input
              type="time"
              aria-label="Time"
              value={p?.hasTime ? format(p.date, "HH:mm") : ""}
              onChange={(e) => setTime(e.target.value || null)}
              className="h-7 flex-1 rounded-md border bg-transparent px-1.5 text-xs tabular-nums outline-none focus-visible:border-ring"
            />
            {p?.hasTime && (
              <button type="button" onClick={() => setTime(null)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Remove time">
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTimeOpen(true)}
            className="flex h-7 flex-1 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ClockIcon className="size-3.5" /> Add time
          </button>
        )}
        {onRecur && (
          <RecurInline recur={recur ?? null} recurFrom={recurFrom ?? null} onPick={onRecur} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ recurrence */

export const RECUR_PRESETS: { label: string; rule: string }[] = [
  { label: "Every day", rule: "FREQ=DAILY" },
  { label: "Every weekday", rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Every week", rule: "FREQ=WEEKLY" },
  { label: "Every 2 weeks", rule: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Every month", rule: "FREQ=MONTHLY" },
  { label: "Every year", rule: "FREQ=YEARLY" },
];

function RecurInline({ recur, recurFrom, onPick }: { recur: string | null; recurFrom: RecurFrom | null; onPick: (r: string | null, f?: RecurFrom | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={recur ? describeRecur(recur, recurFrom) : "Repeat"}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent",
          recur ? "text-due-today" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <RepeatIcon className="size-3.5" />
        {recur ? "Repeats" : "Repeat"}
      </button>
      {open && (
        <div className="absolute right-0 bottom-8 z-10 w-52 rounded-lg border bg-popover p-1 shadow-elevation-2">
          <RecurList recur={recur} recurFrom={recurFrom} onPick={(r, f) => (onPick(r, f), setOpen(false))} />
        </div>
      )}
    </div>
  );
}

/** Repeat presets + free text ("every 3 days", "every! week") + "after completion" toggle. */
export function RecurList({ recur, recurFrom, onPick }: { recur: string | null; recurFrom: RecurFrom | null; onPick: (r: string | null, f?: RecurFrom | null) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    const q = parseQuickAdd(`x ${/^every!?\s/i.test(t) ? t : `every ${t}`}`);
    return q.recur ? q : null;
  }, [text]);
  const from = recurFrom ?? "due";
  return (
    <div className="flex flex-col">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && parsed) {
            e.preventDefault();
            onPick(parsed.recur, parsed.recur_from);
          }
        }}
        placeholder="every 3 days, every mon, wed…"
        className="mb-1 h-7 rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring"
      />
      {text.trim() && (
        <div className="mb-1 px-1 text-[11px] text-muted-foreground">
          {parsed ? `${describeRecur(parsed.recur, parsed.recur_from)} · ↵` : "Not a repeat rule"}
        </div>
      )}
      {RECUR_PRESETS.map((p) => (
        <button
          key={p.rule}
          type="button"
          onClick={() => onPick(p.rule, from)}
          className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"
        >
          <span className="flex-1">{p.label}</span>
          {recur === p.rule && <CheckIcon className="size-3.5 text-foreground" />}
        </button>
      ))}
      {recur && (
        <>
          <button
            type="button"
            onClick={() => onPick(recur, from === "completion" ? "due" : "completion")}
            className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"
          >
            <span className="flex-1">Repeat after completion</span>
            {from === "completion" && <CheckIcon className="size-3.5 text-foreground" />}
          </button>
          <button
            type="button"
            onClick={() => onPick(null, null)}
            className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs text-destructive hover:bg-destructive/10"
          >
            <XIcon className="size-3.5" /> Don’t repeat
          </button>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- priority */

/** Priority items for a DropdownMenu / ContextMenu (pass the item component). */
export function PriorityItems({
  value,
  onPick,
  Item = DropdownMenuItem,
}: {
  value: string | null | undefined;
  onPick: (p: Priority) => void;
  Item?: typeof DropdownMenuItem;
}) {
  return (
    <>
      {PRIORITIES.map((p) => (
        <Item key={p} onSelect={() => onPick(p)} className="gap-2">
          <PriorityFlag priority={p} hideLow={false} />
          <span>{PRIORITY_META[p].label}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {value === p && <CheckIcon className="size-3.5 text-foreground" />}
            {PRIORITY_META[p].short}
          </span>
        </Item>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- labels */

/** Multi-select labels with search and "Create". Toggling keeps the popover open. */
export function LabelPickerContent({ value, onChange }: { value: string[]; onChange: (labels: string[]) => void }) {
  const known = useLabels();
  const [q, setQ] = useState("");
  const names = useMemo(() => {
    const set = new Set([...value, ...known.map((l) => l.name)]);
    return [...set];
  }, [known, value]);
  const clean = q.trim().replace(/^@/, "").replace(/\s+/g, "-");
  const canCreate = clean && !names.some((n) => n.toLowerCase() === clean.toLowerCase());
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  return (
    <Command className="w-60" loop>
      <CommandInput placeholder="Search or create label…" value={q} onValueChange={setQ} />
      <CommandList className="max-h-64">
        <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No labels</CommandEmpty>
        {canCreate && (
          <CommandGroup forceMount>
            <CommandItem value={`__create ${clean}`} onSelect={() => (toggle(clean), setQ(""))} className="gap-2">
              <PlusIcon className="size-3.5" /> Create “{clean}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup>
          {names.map((n) => (
            <CommandItem key={n} value={n} onSelect={() => toggle(n)} className="gap-2">
              <LabelChip name={n} link={false} />
              {value.includes(n) && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* --------------------------------------------------------------- members */

export function MemberPickerContent({ value, onPick, label = "Assign to" }: { value: string | null | undefined; onPick: (id: string) => void; label?: string }) {
  const members = useMembers().data ?? [];
  const humans = members.filter((m) => m.kind === "human");
  const agents = members.filter((m) => m.kind === "agent");
  const row = (m: (typeof members)[number]) => (
    <CommandItem key={m.id} value={`${m.name} ${m.id}`} onSelect={() => onPick(m.id)} className="gap-2">
      <Avatar id={m.id} name={m.name} kind={m.kind} color={m.color} size="sm" />
      <span className="truncate">{m.name}</span>
      {m.name !== m.id && <span className="truncate text-xs text-muted-foreground">{m.id}</span>}
      {value === m.id && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
    </CommandItem>
  );
  return (
    <Command className="w-64" loop>
      <CommandInput placeholder={`${label}…`} />
      <CommandList className="max-h-72">
        <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No members</CommandEmpty>
        {humans.length > 0 && <CommandGroup heading="People">{humans.map(row)}</CommandGroup>}
        {agents.length > 0 && <CommandGroup heading="Agents">{agents.map(row)}</CommandGroup>}
      </CommandList>
    </Command>
  );
}

/* -------------------------------------------------------------- projects */

export function projectLabel(id: string | null | undefined, projects: Project[]): string {
  if (!id) return "Inbox";
  return projects.find((p) => p.id === id)?.title ?? id;
}

/** Inbox, then each project with its sections indented. */
export function ProjectPickerContent({
  project,
  section,
  onPick,
}: {
  project: string | null | undefined;
  section?: string | null;
  onPick: (project: string | null, section: string | null, label: string) => void;
}) {
  const projects = (useProjects().data ?? []).filter((p) => !p.archived || p.id === project);
  return (
    <Command className="w-64" loop>
      <CommandInput placeholder="Move to project…" />
      <CommandList className="max-h-80">
        <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No projects</CommandEmpty>
        <CommandGroup>
          <CommandItem value="Inbox" onSelect={() => onPick(null, null, "Inbox")} className="gap-2">
            <InboxIcon className="size-3.5 text-foreground" /> Inbox
            {!project && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
          </CommandItem>
        </CommandGroup>
        {projects.length > 0 && <CommandSeparator />}
        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <ProjectOption key={p.id} p={p} project={project} section={section} onPick={onPick} />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function ProjectOption({
  p,
  project,
  section,
  onPick,
}: {
  p: Project;
  project: string | null | undefined;
  section?: string | null;
  onPick: (project: string | null, section: string | null, label: string) => void;
}) {
  return (
    <>
      <CommandItem value={`${p.title} ${p.id}`} onSelect={() => onPick(p.id, null, p.title)} className="gap-2">
        <HashIcon className="size-3.5" style={{ color: entityColor(p.id, p.color) }} />
        <span className="truncate">{p.title}</span>
        {project === p.id && !section && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
      </CommandItem>
      {p.sections.map((s) => (
        <CommandItem key={s} value={`${p.title} / ${s} ${p.id}`} onSelect={() => onPick(p.id, s, `${p.title} / ${s}`)} className="gap-2 pl-7 text-muted-foreground">
          <span className="text-muted-foreground/60">/</span>
          <span className="truncate text-foreground/90">{s}</span>
          {project === p.id && section === s && <CheckIcon className="ml-auto size-3.5 text-foreground" />}
        </CommandItem>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------- tasks */

/** Search open tasks (blockers, parents). */
export function TaskPickerContent({ exclude = [], onPick, placeholder = "Find a task…" }: { exclude?: string[]; onPick: (t: Task) => void; placeholder?: string }) {
  const { data } = useTasks();
  const rows = (data ?? []).filter((t) => !exclude.includes(t.id));
  return (
    <Command className="w-80" loop>
      <CommandInput placeholder={placeholder} />
      <CommandList className="max-h-72">
        <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No matching tasks</CommandEmpty>
        <CommandGroup>
          {rows.slice(0, 300).map((t) => (
            <CommandItem key={t.id} value={`${t.title} ${t.id}`} onSelect={() => onPick(t)} className="gap-2">
              <PriorityFlag priority={t.priority} hideLow={false} className="opacity-80" />
              <span className="truncate">{t.title}</span>
              <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{t.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* ------------------------------------------------------------------ misc */

/** A label + icon row used in field grids and menus. */
export function FieldIcon({ icon: Icon, children, className }: { icon: typeof TagIcon; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
