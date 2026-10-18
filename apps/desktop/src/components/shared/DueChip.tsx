import { CalendarIcon, CalendarClockIcon, RepeatIcon, TargetIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, dueTone, dueToneClass, isOverdue, parseDue, relativeDayLabel } from "@/lib/dates";
import { describeRecur } from "@/lib/recur";
import type { RecurFrom } from "@/lib/types";
import { useNow } from "@/lib/now";

export interface DueChipProps {
  due: string | null | undefined;
  recur?: string | null;
  recurFrom?: RecurFrom | null;
  /** Reference time (tests / stable renders). */
  now?: Date;
  className?: string;
  /** Pill spacing and a neutral fill instead of bare text. */
  variant?: "text" | "pill";
}

/**
 * Due date chip: overdue danger, today success, tomorrow fg, this week and later muted (text only).
 * A repeat icon replaces the calendar for recurring tasks (tooltip = rule description).
 */
export function DueChip({ due, recur, recurFrom, now, className, variant = "text" }: DueChipProps) {
  const p = parseDue(due);
  if (!p) return null;
  const tone = dueTone(due, now) ?? "later";
  const Icon = recur ? RepeatIcon : p.hasTime ? CalendarClockIcon : CalendarIcon;
  const title = [p.hasTime ? due?.replace("T", " ") : due, recur ? describeRecur(recur, recurFrom) : null].filter(Boolean).join(" · ");
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap tabular-nums",
        dueToneClass(tone),
        variant === "pill" && "rounded-md bg-muted px-1.5 py-0.5",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" strokeWidth={2.2} />
      <span>{dueLabel(due, now)}</span>
    </span>
  );
}

/** Deadline chip (`{…}` in quick add): target icon, red when past, otherwise muted. */
export function DeadlineChip({ deadline, now, className }: { deadline: string | null | undefined; now?: Date; className?: string }) {
  const clock = useNow();
  const p = parseDue(deadline);
  if (!p) return null;
  const past = isOverdue(deadline, now ?? clock);
  return (
    <span
      title={`Deadline ${deadline}`}
      className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", past ? "text-due-overdue" : "text-muted-foreground", className)}
    >
      <TargetIcon className="size-3 shrink-0" strokeWidth={2.2} />
      <span>{relativeDayLabel(p.date, now)}</span>
    </span>
  );
}
