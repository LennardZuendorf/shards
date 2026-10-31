import { cn } from "@/lib/utils";

/** Two-facet Flint mark, shared with the browser and native application icons. */
export function ShardsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden fill="currentColor" className={cn("size-6 text-foreground", className)}>
      <polygon points="32,8 82,22 92,62 52,94 10,56" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" />
      <polygon points="32,8 82,22 92,62 54,52" className="fill-muted-foreground" />
    </svg>
  );
}
