import { FlagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { priorityMeta } from "@/lib/priority";

export interface PriorityFlagProps {
  priority: string | null | undefined;
  className?: string;
  /** Hide for low / unset (Todoist shows no flag for P4). Default true. */
  hideLow?: boolean;
  /** Show the "P1" short label next to the flag. */
  withLabel?: boolean;
}

/** Filled flag tinted by priority: urgent red, high orange, normal blue, low outline gray. */
export function PriorityFlag({ priority, className, hideLow = true, withLabel }: PriorityFlagProps) {
  const m = priorityMeta(priority);
  if (hideLow && (!priority || m.value === "low")) return null;
  const filled = m.value !== "low";
  return (
    <span className={cn("inline-flex items-center gap-1", m.text, className)} title={`${m.short} · ${m.label}`}>
      <FlagIcon className="size-3.5" fill={filled ? "currentColor" : "none"} strokeWidth={2} />
      {withLabel && <span className="text-xs font-medium">{m.short}</span>}
    </span>
  );
}
