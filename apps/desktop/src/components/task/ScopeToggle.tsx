import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TaskScope } from "@/lib/scope";

/** "Mine · Everyone" switch for the personal views (Today, Upcoming). */
export function ScopeToggle({ value, onChange }: { value: TaskScope; onChange: (s: TaskScope) => void }) {
  return (
    <ToggleGroup type="single" size="sm" variant="outline" value={value} onValueChange={(v) => v && onChange(v as TaskScope)} aria-label="Whose tasks">
      <ToggleGroupItem value="mine" className="px-2.5 text-xs" title="Tasks you own, hold, or nobody owns">
        Mine
      </ToggleGroupItem>
      <ToggleGroupItem value="everyone" className="px-2.5 text-xs" title="Include tasks delegated to agents and others">
        Everyone
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
