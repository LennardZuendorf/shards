import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { priorityMeta } from "@/lib/priority";

export interface PriorityCheckboxProps {
  priority: string | null | undefined;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
  /** Recurring tasks show a dashed ring hint. */
  recurring?: boolean;
}

/**
 * Todoist-style round checkbox: ring + faint fill tinted by priority, a check preview on hover,
 * and a pop + stroke-draw animation when checked. Unset priority → neutral ring.
 */
export function PriorityCheckbox({
  priority,
  checked,
  onCheckedChange,
  disabled,
  size = "md",
  className,
  recurring,
  ...rest
}: PriorityCheckboxProps) {
  const [anim, setAnim] = useState(0);
  const m = priority ? priorityMeta(priority) : null;
  const tinted = m && m.value !== "low";
  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!checked) setAnim((n) => n + 1);
    onCheckedChange?.(!checked);
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={rest["aria-label"] ?? (checked ? "Mark as not done" : "Complete task")}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle(e);
        }
      }}
      className={cn(
        "group/check relative inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-150 outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "size-4" : "size-[18px]",
        tinted ? cn(m.border, m.bg) : "border-muted-foreground/45",
        recurring && !checked && "border-dashed",
        checked && (tinted ? cn(m.fill, m.border) : "border-muted-foreground/60 bg-muted-foreground/60"),
        anim > 0 && checked && "animate-check-pop",
        className,
      )}
    >
      <svg
        key={anim}
        viewBox="0 0 24 24"
        aria-hidden
        className={cn(
          "pointer-events-none size-[70%] fill-none stroke-[3.2] [stroke-linecap:round] [stroke-linejoin:round]",
          checked
            ? "stroke-white opacity-100 dark:stroke-background"
            : cn("opacity-0 group-hover/check:opacity-100", tinted ? m.stroke : "stroke-muted-foreground"),
          "transition-opacity duration-100",
          checked && anim > 0 && "animate-check-draw [stroke-dasharray:24] [stroke-dashoffset:24]",
        )}
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}
