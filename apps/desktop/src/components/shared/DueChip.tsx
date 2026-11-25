import { CalendarIcon, CalendarClockIcon, RepeatIcon, TargetIcon } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
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
 * Due date chip: overdue ember, today/tomorrow neutral foreground, later dates muted.
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
        "inline-flex items-center gap-1 font-mono text-xs whitespace-nowrap tabular-nums",
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

/**
 * Deadline chip (`{…}` in quick add): an outlined target glyph, so it reads as a second, harder
 * date beside the due chip. `semantic.danger` once past, `semantic.warning` within two days.
 */
export function DeadlineChip({ deadline, now, className }: { deadline: string | null | undefined; now?: Date; className?: string }) {
  const clock = useNow();
  const p = parseDue(deadline);
  if (!p) return null;
  const at = now ?? clock;
  const tone = isOverdue(deadline, at)
    ? "text-due-overdue ring-due-overdue/40"
    : differenceInCalendarDays(p.date, at) <= 2
      ? "text-warning ring-warning/40"
      : "text-muted-foreground ring-border";
  return (
    <span
      title={`Deadline ${deadline}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-mono text-xs whitespace-nowrap ring-1 ring-inset",
        tone,
        className,
      )}
    >
      <TargetIcon className="size-3 shrink-0" strokeWidth={2.2} />
      <span>{relativeDayLabel(p.date, at)}</span>
    </span>
  );
}
