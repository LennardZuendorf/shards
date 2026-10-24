/**
 * The "Filter" popover on task list views (R44): one checkbox section per filter. Values inside a
 * section combine with OR, sections with AND. An active filter puts a dot on the trigger; the
 * choices show as chips under the view header (FilterChips).
 */
import { ListFilterIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BUCKET_LABEL, BUCKET_ORDER } from "@/lib/dates";
import { useLabels, useMembers } from "@/lib/hooks";
import { PRIORITY_META } from "@/lib/priority";
import { PRIORITIES, type Priority } from "@/lib/types";
import type { TaskFilters } from "@/lib/ui-contract";
import { filtersActive } from "@/lib/view-options";

export interface FilterMenuProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Option({ label, checked, onToggle }: { label: ReactNode; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-small hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

const toggled = <T,>(list: readonly T[] | undefined, v: T): T[] | undefined => {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
};

/** `filters` with one key set, or removed when `value` is undefined. */
function withKey<K extends keyof TaskFilters>(f: TaskFilters, key: K, value: TaskFilters[K] | undefined): TaskFilters {
  const next = { ...f };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function FilterMenu({ filters, onChange }: FilterMenuProps) {
  const labels = useLabels();
  const { data: members } = useMembers();
  // A stored label that no open task carries any more stays listed, so it can be unchecked.
  const labelNames = useMemo(() => {
    const names = labels.map((l) => l.name);
    for (const l of filters.labels ?? []) if (!names.includes(l)) names.push(l);
    return names;
  }, [labels, filters.labels]);
  const active = filtersActive(filters);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Filter tasks" className="relative text-muted-foreground" data-filter-trigger="">
          <ListFilterIcon /> <span className="hidden @2xl/view:inline">Filter</span>
          {active && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground" data-active-dot="" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70svh] w-72 space-y-3 overflow-y-auto p-3" data-filter-menu="">
        <Section title="Priority">
          {PRIORITIES.map((p: Priority) => (
            <Option key={p} label={PRIORITY_META[p].label} checked={!!filters.priority?.includes(p)} onToggle={() => onChange(withKey(filters, "priority", toggled(filters.priority, p)))} />
          ))}
        </Section>
        <Section title="Due">
          {BUCKET_ORDER.map((b) => (
            <Option key={b} label={BUCKET_LABEL[b]} checked={!!filters.due?.includes(b)} onToggle={() => onChange(withKey(filters, "due", toggled(filters.due, b)))} />
          ))}
        </Section>
        {labelNames.length > 0 && (
          <Section title="Label">
            {labelNames.map((l) => (
              <Option key={l} label={`@${l}`} checked={!!filters.labels?.includes(l)} onToggle={() => onChange(withKey(filters, "labels", toggled(filters.labels, l)))} />
            ))}
          </Section>
        )}
        <Section title="Assignee">
          {(members ?? []).map((m) => (
            <Option key={m.id} label={m.name} checked={!!filters.assignees?.includes(m.id)} onToggle={() => onChange(withKey(filters, "assignees", toggled(filters.assignees, m.id)))} />
          ))}
          <Option label="Unassigned" checked={!!filters.assignees?.includes("")} onToggle={() => onChange(withKey(filters, "assignees", toggled(filters.assignees, "")))} />
        </Section>
        <Section title="More">
          <Option label="Has deadline" checked={filters.hasDeadline === true} onToggle={() => onChange(withKey(filters, "hasDeadline", filters.hasDeadline === true ? undefined : true))} />
          <Option label="Blocked" checked={filters.blocked === true} onToggle={() => onChange(withKey(filters, "blocked", filters.blocked === true ? undefined : true))} />
        </Section>
        {active && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange({})}>
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
