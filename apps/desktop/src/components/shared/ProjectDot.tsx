import { cn } from "@/lib/utils";
import { entityColor } from "@/lib/color";

/** Small project color dot (project `color` or a hue hashed from its id). */
export function ProjectDot({ id, color, className }: { id: string; color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: entityColor(id, color) }}
    />
  );
}
