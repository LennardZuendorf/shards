import { Button } from "@/components/ui/button";

/**
 * A retained draft needs an explicit choice after its source changes (R26). `detail` lets a field
 * name who moved the source on and when; without it the plain wording is used.
 */
export function SourceConflictNotice({
  field,
  detail,
  onKeep,
  onReload,
}: {
  field: string;
  detail?: string;
  onKeep: () => void;
  onReload: () => void;
}) {
  return (
    <div role="status" className="mt-2 rounded-lg border border-input bg-muted p-2 text-xs text-foreground">
      <p>{detail ?? `The ${field} changed on disk. Your draft is kept.`}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" onClick={onKeep}>Use my {field}</Button>
        <Button size="xs" variant="ghost" onClick={onReload}>Use latest</Button>
      </div>
    </div>
  );
}
