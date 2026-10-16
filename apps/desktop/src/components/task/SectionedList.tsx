/**
 * A project-shaped list (Inbox or a project): an unsectioned head, one group per section with
 * a header menu (add task, rename, move, remove), "Add section", and an optional completed group.
 *
 * Section names and their order (empty sections included) live in the project note's
 * frontmatter (`sections:`) through `host_project_update`, so agents, the CLI and every device
 * see them; a rename or removal is one host call that also rewrites every task's `section`.
 * The Inbox has no note (nor do older hosts have the tool): there sections come from task values
 * and an empty one lives in memory only (see `useSectionStore`). Collapsed state is per viewer.
 */
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { compareManual, countTopLevel, groupBySection } from "./model";
import { useSectionStore } from "./section-store";
import { TaskList, type TaskGroupSpec } from "./TaskList";

export interface SectionedListProps {
  /** `null` = Inbox. */
  project: string | null;
  tasks: Task[];
  completed?: Task[] | null;
  storageKey: string;
}

export function SectionedList({ project, tasks, completed, storageKey }: SectionedListProps) {
  const store = useSectionStore(project, tasks);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => groupBySection(tasks, store.sections), [tasks, store.sections]);
  const order = store.sections;

  const move = (name: string, delta: number) => {
    const next = [...order];
    const i = next.indexOf(name);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    store.setOrder(next);
  };

  const rename = (from: string, to: string) => {
    const name = to.trim();
    setRenaming(null);
    if (!name || name === from) return;
    if (groups.some((g) => g.section === name)) {
      toast.error(`A section “${name}” already exists`);
      return;
    }
    store.rename(from, name);
  };

  const remove = (name: string) => {
    const n = tasks.filter((t) => (t.section ?? "") === name).length;
    store.remove(name);
    if (n) toast.success(`Removed section “${name}”`, { description: `${n} task${n > 1 ? "s" : ""} moved to the top of the list.` });
  };

  const addSection = (name: string) => {
    const n = name.trim();
    setAdding(false);
    if (!n) return;
    if (groups.some((g) => g.section === n)) {
      toast.error(`A section “${n}” already exists`);
      return;
    }
    store.setOrder([...order, n]);
  };

  const specs: TaskGroupSpec[] = groups.map((g) => ({
    key: `s:${g.section}`,
    label: g.section || undefined,
    title: g.section
      ? renaming === g.section
        ? <InlineName initial={g.section} onDone={(v) => rename(g.section, v ?? g.section)} />
        : g.section
      : undefined,
    collapsible: !!g.section && renaming !== g.section,
    tasks: g.tasks,
    reorder: true,
    compare: compareManual,
    addDefaults: { project, section: g.section || null },
    dropArgs: () => ({ section: g.section || null }),
    actions: g.section ? (
      <SectionMenu
        onRename={() => setRenaming(g.section)}
        onRemove={() => remove(g.section)}
        onMove={(d) => move(g.section, d)}
        count={countTopLevel(g.tasks)}
      />
    ) : undefined,
  }));

  if (completed?.length) {
    specs.push({
      key: "completed",
      title: "Completed",
      dim: true,
      tasks: completed,
      compare: (a, b) => (b.completed ?? b.updated ?? "").localeCompare(a.completed ?? a.updated ?? ""),
      dropArgs: () => null,
    });
  }

  return (
    <div>
      <TaskList groups={specs} storageKey={storageKey} rowProps={{ showProject: false }} onBeforeDrop={store.ensurePersisted} />
      <div className="-mt-8 pb-12">
        {adding ? (
          <div className="mt-6 flex items-center gap-2">
            <InlineName initial="" placeholder="Name this section" onDone={(v) => (v === null ? setAdding(false) : addSection(v))} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group/sec mt-4 flex w-full items-center gap-3 py-1 text-[13px] font-medium text-primary opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <span className="h-px flex-1 bg-primary/40" />
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="size-3.5" /> Add section
            </span>
            <span className="h-px flex-1 bg-primary/40" />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionMenu({ onRename, onRemove, onMove, count }: { onRename: () => void; onRemove: () => void; onMove: (delta: number) => void; count: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Section actions" className="text-muted-foreground opacity-0 group-hover/gh:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onRename} className="gap-2">
          <PencilIcon /> Rename section
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove(-1)} className="gap-2">
          <ArrowUpIcon /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove(1)} className="gap-2">
          <ArrowDownIcon /> Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove} className="gap-2">
          <Trash2Icon /> {count ? "Remove section (keep tasks)" : "Remove section"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline name editor for sections. `onDone(null)` = cancelled. */
export function InlineName({ initial, onDone, placeholder }: { initial: string; onDone: (v: string | null) => void; placeholder?: string }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (val: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <span className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(v);
          if (e.key === "Escape") finish(null);
        }}
        onBlur={() => finish(v.trim() ? v : null)}
        className={cn("h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-[14px] font-semibold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25")}
      />
      <Button size="icon-xs" variant="ghost" aria-label="Save" onMouseDown={(e) => e.preventDefault()} onClick={() => finish(v)}>
        <CheckIcon />
      </Button>
    </span>
  );
}
