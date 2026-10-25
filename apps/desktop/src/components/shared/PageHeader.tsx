import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page header every route uses: a 22 px title (optional icon), a muted subtitle line
 * and right-aligned actions. Pair it with `PAGE_WIDTH` (page-width.ts) so routes share one column rhythm.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex min-h-9 items-start gap-3", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-title font-semibold tracking-[-0.01em]">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1 pt-0.5">{actions}</div>}
    </div>
  );
}
