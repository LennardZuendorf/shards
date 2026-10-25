/** Small layout/meta primitives shared by the agent, memory, scratch, note and settings views. */
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "5m ago" with the absolute timestamp in a tooltip. */
export function RelTime({ iso, now, className, prefix }: { iso: string | null | undefined; now?: Date; className?: string; prefix?: string }) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn("whitespace-nowrap tabular-nums", className)}>
          {prefix}
          {relativeTime(iso, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </TooltipContent>
    </Tooltip>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = "default",
  hint,
  onClick,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: "default" | "working" | "awaiting" | "done" | "brand";
  hint?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  const toneCls = {
    default: "text-muted-foreground bg-muted",
    working: "text-status-working bg-muted",
    awaiting: "text-status-awaiting bg-muted",
    done: "text-status-done bg-muted",
    brand: "text-foreground bg-muted",
  }[tone];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors",
        onClick && "outline-none hover:border-foreground/15 hover:bg-row-hover focus-visible:ring-3 focus-visible:ring-ring",
      )}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneCls)}>
        <Icon className="size-4" strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        {loading ? (
          <Skeleton className="mb-1 h-5 w-8" />
        ) : (
          <span className="block text-lg leading-tight font-semibold tracking-tight tabular-nums">{value}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground" title={hint}>
          {label}
        </span>
      </span>
    </Comp>
  );
}

export function SectionHeader({ title, count, action, className }: { title: ReactNode; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 pb-2", className)}>
      <h3 className="text-small font-semibold tracking-tight text-foreground">{title}</h3>
      {count != null && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </div>
  );
}

/** Label/value row in property panels. */
export function PropRow({ label, icon: Icon, children, className }: { label: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-h-8 grid-cols-[112px_1fr] items-center gap-2 text-small", className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="size-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Pulsing "live" dot (agent writing now). */
export function LiveDot({ className, label = "Live" }: { className?: string; label?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} title={label} aria-label={label}>
      <span className="absolute inset-0 animate-ping rounded-full bg-status-working/60" />
      <span className="relative size-2 rounded-full bg-status-working" />
    </span>
  );
}

/** Skeleton rows for list loading states. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-1 p-2", className)} aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <Skeleton className="size-7 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 29) % 40)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inline banner (warnings, info) used inside panels. */
export function Banner({
  tone = "info",
  icon: Icon,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "muted";
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const cls = {
    info: "border-border bg-muted/50 text-foreground",
    warning: "border-warning/30 bg-warning/10 text-foreground",
    danger: "border-destructive/25 bg-destructive/8 text-foreground",
    muted: "border-border bg-muted/50 text-muted-foreground",
  }[tone];
  const iconCls = { info: "text-muted-foreground", warning: "text-warning", danger: "text-destructive", muted: "text-muted-foreground" }[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2 text-small", cls, className)}>
      {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", iconCls)} />}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}
