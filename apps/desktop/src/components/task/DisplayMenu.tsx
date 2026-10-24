/**
 * The "Display" popover on task list views (R43): Group by, Sort by (with direction) and
 * Density, remembered per view. A non-default choice puts a dot on the trigger; a non-manual
 * sort says that manual order (drag-reorder, ⌥↑/⌥↓) is off.
 */
import { ArrowDownIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Density, GroupBy, SortBy, ViewOptions } from "@/lib/ui-contract";
import { DEFAULT_VIEW_OPTIONS } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<Exclude<GroupBy, "default">, string> = {
  none: "None",
  due: "Due date",
  priority: "Priority",
  project: "Project",
  section: "Section",
  assignee: "Assignee",
  label: "Label",
};

const SORT_LABEL: Record<SortBy, string> = {
  manual: "Manual",
  due: "Due date",
  priority: "Priority",
  title: "Title",
  created: "Created",
  updated: "Updated",
};

export interface DisplayMenuProps {
  options: ViewOptions;
  onChange: (patch: Partial<ViewOptions>) => void;
  /** What the view groups by when left alone, e.g. "Sections" or "Days". */
  defaultLabel: string;
  /** Offer Section grouping (project views). */
  sections?: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-small text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

export function DisplayMenu({ options, onChange, defaultLabel, sections }: DisplayMenuProps) {
  const d = DEFAULT_VIEW_OPTIONS;
  const changed = options.group !== d.group || options.sort !== d.sort || options.density !== d.density;
  const groups = (Object.keys(GROUP_LABEL) as Exclude<GroupBy, "default">[]).filter((g) => sections || g !== "section");
  const sorted = options.sort !== "manual";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Display options" className="relative text-muted-foreground" data-display-trigger="">
          <SlidersHorizontalIcon /> <span className="hidden @2xl/view:inline">Display</span>
          {changed && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground" data-active-dot="" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3" data-display-menu="">
        <Row label="Group by">
          <Select value={options.group} onValueChange={(v) => onChange({ group: v as GroupBy })}>
            <SelectTrigger size="sm" className="w-44" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default ({defaultLabel})</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {GROUP_LABEL[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Sort by">
          <Select value={options.sort} onValueChange={(v) => onChange({ sort: v as SortBy })}>
            <SelectTrigger size="sm" className="w-36" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!sorted}
            aria-label={options.dir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
            onClick={() => onChange({ dir: options.dir === "asc" ? "desc" : "asc" })}
          >
            {options.dir === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </Button>
        </Row>
        <Row label="Density">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={options.density}
            onValueChange={(v) => v && onChange({ density: v as Density })}
            aria-label="Density"
          >
            <ToggleGroupItem value="comfortable" className="px-2.5 text-xs">
              Comfortable
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" className="px-2.5 text-xs">
              Compact
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
        {sorted && (
          <p className={cn("rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground")} data-manual-off="">
            Manual order is off while sorted
          </p>
        )}
        {changed && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange({ group: d.group, sort: d.sort, dir: d.dir, density: d.density })}>
            Reset to default
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
