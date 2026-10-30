import { cn } from "@/lib/utils";
import { projectShape } from "@/lib/identity";

/** Deterministic monochrome project mark; stored color remains available to editors. */
export function ProjectDot({ id, className }: { id: string; color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      data-shape={projectShape(id)}
      className={cn("project-mark inline-block size-2 shrink-0 bg-current text-muted-foreground", className)}
    />
  );
}
