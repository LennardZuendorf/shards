/** Memory display atoms: kind icon/badge, scope badge, importance dots, expiry badge. */
import {
  CalendarClockIcon,
  CalendarXIcon,
  HistoryIcon,
  InfoIcon,
  LightbulbIcon,
  ListOrderedIcon,
  LockIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/dates";
import type { MemoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DEFAULT_IMPORTANCE, expiryState } from "./memory-utils";

export interface KindMeta {
  label: string;
  icon: LucideIcon;
  /** Tile classes (icon square). */
  tile: string;
  text: string;
  description: string;
}

export const KIND_META: Record<MemoryKind, KindMeta> = {
  fact: {
    label: "Fact",
    icon: InfoIcon,
    tile: "bg-[oklch(0.94_0.04_255)] text-[oklch(0.5_0.15_255)] dark:bg-[oklch(0.3_0.06_255)] dark:text-[oklch(0.82_0.1_255)]",
    text: "text-[oklch(0.52_0.15_255)] dark:text-[oklch(0.78_0.11_255)]",
    description: "Something true about the code, the world or the team",
  },
  preference: {
    label: "Preference",
    icon: SlidersHorizontalIcon,
    tile: "bg-[oklch(0.94_0.045_330)] text-[oklch(0.52_0.17_330)] dark:bg-[oklch(0.3_0.07_330)] dark:text-[oklch(0.84_0.1_330)]",
    text: "text-[oklch(0.54_0.17_330)] dark:text-[oklch(0.8_0.12_330)]",
    description: "How someone likes things done",
  },
  procedure: {
    label: "Procedure",
    icon: ListOrderedIcon,
    tile: "bg-[oklch(0.94_0.045_160)] text-[oklch(0.48_0.12_160)] dark:bg-[oklch(0.3_0.06_160)] dark:text-[oklch(0.82_0.1_160)]",
    text: "text-[oklch(0.5_0.12_160)] dark:text-[oklch(0.78_0.11_160)]",
    description: "Steps that work — how to do a thing here",
  },
  insight: {
    label: "Insight",
    icon: LightbulbIcon,
    tile: "bg-[oklch(0.95_0.06_75)] text-[oklch(0.55_0.13_65)] dark:bg-[oklch(0.32_0.06_70)] dark:text-[oklch(0.86_0.11_80)]",
    text: "text-[oklch(0.58_0.13_65)] dark:text-[oklch(0.82_0.12_80)]",
    description: "A learned pattern or conclusion",
  },
  episode: {
    label: "Episode",
    icon: HistoryIcon,
    tile: "bg-[oklch(0.94_0.04_293)] text-[oklch(0.52_0.18_293)] dark:bg-[oklch(0.3_0.07_293)] dark:text-[oklch(0.84_0.1_293)]",
    text: "text-[oklch(0.54_0.18_293)] dark:text-[oklch(0.8_0.12_293)]",
    description: "Something that happened, with a time",
  },
};

const UNKNOWN_KIND: KindMeta = {
  label: "Other",
  icon: SparklesIcon,
  tile: "bg-muted text-muted-foreground",
  text: "text-muted-foreground",
  description: "Unknown kind (kept as written)",
};

export const kindMeta = (k: string | null | undefined): KindMeta => (k && k in KIND_META ? KIND_META[k as MemoryKind] : { ...UNKNOWN_KIND, label: k || "Other" });

export function KindIcon({ kind, size = "md", className }: { kind: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const m = kindMeta(kind);
  const box = { sm: "size-5 rounded-md", md: "size-7 rounded-lg", lg: "size-9 rounded-xl" }[size];
  const icon = { sm: "size-3", md: "size-3.5", lg: "size-4.5" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", box, m.tile, className)} title={m.label}>
      <m.icon className={icon} strokeWidth={2.2} />
    </span>
  );
}

export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const m = kindMeta(kind);
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium", m.tile, className)}>
      <m.icon className="size-3" strokeWidth={2.2} />
      {m.label}
    </span>
  );
}

export function ScopeBadge({ scope, showShared = false, className }: { scope: string; showShared?: boolean; className?: string }) {
  if (scope === "shared" && !showShared) return null;
  const priv = scope === "private";
  const Icon = priv ? LockIcon : UsersIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium",
            priv ? "bg-warning/12 text-[oklch(0.5_0.12_65)] dark:text-warning" : "bg-muted text-muted-foreground",
            className,
          )}
        >
          <Icon className="size-3" strokeWidth={2.2} />
          {priv ? "Private" : scope === "shared" ? "Shared" : scope}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        {priv
          ? "Hidden from other agents’ lists and recall. Not a permission: anyone with the vault can read the file."
          : "Visible to every agent’s list and recall."}
      </TooltipContent>
    </Tooltip>
  );
}

/** Five dots; filled = importance. Null shows hollow "3 (default)". Editable when `onChange`. */
export function ImportanceDots({
  value,
  onChange,
  size = "sm",
  className,
  nullAsEmpty,
}: {
  value: number | null | undefined;
  onChange?: (n: number) => void;
  size?: "sm" | "md";
  className?: string;
  /** Render null as no dots (filters) instead of the hollow default 3. */
  nullAsEmpty?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const v = typeof value === "number" ? value : null;
  const shown = hover ?? v ?? (nullAsEmpty ? 0 : DEFAULT_IMPORTANCE);
  const dot = size === "md" ? "size-2.5" : "size-[7px]";
  const label = v == null ? `Importance ${DEFAULT_IMPORTANCE} (default)` : `Importance ${v} of 5`;
  return (
    <span
      role={onChange ? "radiogroup" : "meter"}
      aria-label={label}
      aria-valuenow={onChange ? undefined : (v ?? DEFAULT_IMPORTANCE)}
      aria-valuemin={onChange ? undefined : 1}
      aria-valuemax={onChange ? undefined : 5}
      title={label}
      className={cn("inline-flex items-center", size === "md" ? "gap-1" : "gap-[3px]", className)}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const cls = cn(
          "rounded-full transition-colors",
          dot,
          on ? (v == null && hover == null ? "border border-primary/60 bg-transparent" : n >= 4 ? "bg-primary" : "bg-primary/65") : "bg-foreground/12",
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={v === n}
            aria-label={`Importance ${n}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className="grid size-4 place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className={cls} />
          </button>
        ) : (
          <span key={n} className={cls} />
        );
      })}
    </span>
  );
}

export function ExpiryBadge({ expires, now, className, hideFuture }: { expires: string | null | undefined; now?: Date; className?: string; hideFuture?: boolean }) {
  const st = expiryState(expires, now);
  if (st === "none" || (hideFuture && st === "future")) return null;
  const date = expires ? new Date(expires) : null;
  const abs = date?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) ?? "";
  const rel = expires ? relativeTime(expires, now) : "";
  const text = st === "expired" ? "Expired" : st === "soon" ? `Expires ${inDays(expires, now)}` : `Expires ${abs}`;
  return (
    <span
      title={st === "expired" ? `Expired ${abs} (${rel}) · not recalled` : `Expires ${abs}`}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium whitespace-nowrap",
        st === "expired" && "bg-destructive/10 text-destructive",
        st === "soon" && "bg-warning/14 text-[oklch(0.52_0.13_60)] dark:text-warning",
        st === "future" && "text-muted-foreground",
        className,
      )}
    >
      {st === "expired" ? <CalendarXIcon className="size-3" /> : <CalendarClockIcon className="size-3" />}
      {text}
    </span>
  );
}

function inDays(expires: string | null | undefined, now: Date = new Date()): string {
  if (!expires) return "";
  const ms = Date.parse(expires) - now.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `in ${Math.max(1, h)}h`;
  return `in ${Math.round(h / 24)}d`;
}
