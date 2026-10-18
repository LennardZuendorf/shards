/** Active filter chips under a task view's header (R44) and the "filtered to zero" state (R28). */
import { FilterXIcon, XIcon } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useMemberMap } from "@/lib/hooks";
import type { TaskFilters } from "@/lib/ui-contract";
import { filterChips, filtersActive } from "@/lib/view-options";
import { enterFilteredToZero, useFilteredToZero } from "./filtered-to-zero";

export interface FilterChipsProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

/** Nothing when no filter is active. Each chip's × removes that filter; "Clear filters" all. */
export function FilterChips({ filters, onChange }: FilterChipsProps) {
  const members = useMemberMap();
  const zero = useFilteredToZero();
  if (!filtersActive(filters)) return null;
  const chips = filterChips(filters, (id) => members.get(id)?.name ?? id);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Active filters" data-filter-chips="">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pr-0.5 pl-2.5 text-xs text-foreground" data-filter-chip={c.key}>
          {c.label}
          <button
            type="button"
            aria-label={`Remove filter ${c.label}`}
            onClick={() => onChange(c.clear(filters))}
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      {/* The "filtered to zero" empty state carries the one Clear filters button. */}
      {!zero && (
        <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => onChange({})}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** R28: every row is filtered out. Names the active filters and offers "Clear filters". */
export function FilteredToZero({ filters, onChange }: FilterChipsProps) {
  const members = useMemberMap();
  const names = filterChips(filters, (id) => members.get(id)?.name ?? id).map((c) => c.label);
  useEffect(() => enterFilteredToZero(), []);
  return (
    <EmptyState
      icon={FilterXIcon}
      tone="muted"
      title="No tasks match these filters"
      description={names.join(" · ")}
      action={
        <Button variant="outline" size="sm" onClick={() => onChange({})}>
          Clear filters
        </Button>
      }
    />
  );
}
