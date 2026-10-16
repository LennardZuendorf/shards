import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Buttons / links under the text. */
  action?: ReactNode;
  className?: string;
  /** Smaller variant for panes and popovers. */
  compact?: boolean;
  tone?: "brand" | "success" | "muted";
}

const TONE = {
  brand: "text-primary bg-primary/10 ring-primary/15",
  success: "text-success bg-success/10 ring-success/20",
  muted: "text-muted-foreground bg-muted ring-border",
};

/** Illustrated empty state: an icon in a soft halo with stacked "shard" rings, title, text, action. */
export function EmptyState({ icon: Icon, title, description, action, className, compact, tone = "brand" }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-16", className)}>
      <div className={cn("relative mb-1 grid place-items-center", compact ? "size-14" : "size-24")} aria-hidden>
        <div className={cn("absolute inset-0 rotate-12 rounded-[30%] opacity-40 ring-1", TONE[tone])} />
        <div className={cn("absolute inset-[14%] -rotate-6 rounded-[30%] opacity-70 ring-1", TONE[tone])} />
        <div className={cn("relative grid place-items-center rounded-[30%] ring-1", TONE[tone], compact ? "size-9" : "size-14")}>
          <Icon className={compact ? "size-4" : "size-6"} strokeWidth={1.8} />
        </div>
      </div>
      <div className={cn("font-semibold tracking-tight text-foreground", compact ? "text-sm" : "text-base")}>{title}</div>
      {description && <div className={cn("max-w-sm text-muted-foreground", compact ? "text-xs" : "text-sm")}>{description}</div>}
      {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
    </div>
  );
}
