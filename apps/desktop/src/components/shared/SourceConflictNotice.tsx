import { Button } from "@/components/ui/button";

/** A retained draft needs an explicit choice after its source changes. */
export function SourceConflictNotice({ field, onKeep, onReload }: { field: string; onKeep: () => void; onReload: () => void }) {
  return (
    <div role="status" className="mt-2 rounded-lg border border-input bg-muted p-2 text-xs text-foreground">
      <p>The {field} changed on disk. Your draft is kept.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" onClick={onKeep}>Use my {field}</Button>
        <Button size="xs" variant="ghost" onClick={onReload}>Use latest</Button>
      </div>
    </div>
  );
}
