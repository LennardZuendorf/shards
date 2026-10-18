import { TagIcon, XIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { navigate, paths } from "@/lib/router";

export interface LabelChipProps {
  name: string;
  className?: string;
  /** Navigate to the label view on click (default true). */
  link?: boolean;
  onRemove?: () => void;
  size?: "sm" | "md";
}

/** A task label (stored as a tag): neutral tag icon + name (label colours are dropped); clickable to the label view. */
export function LabelChip({ name, className, link = true, onRemove, size = "sm" }: LabelChipProps) {
  const go = (e: MouseEvent) => {
    if (!link) return;
    e.stopPropagation();
    navigate(paths.label(name));
  };
  return (
    <span
      role={link ? "link" : undefined}
      onClick={go}
      className={cn(
        "group/label inline-flex max-w-40 items-center gap-1 rounded-md text-muted-foreground transition-colors",
        size === "sm" ? "text-xs" : "bg-secondary px-1.5 py-0.5 text-xs",
        link && "cursor-pointer hover:text-foreground",
        className,
      )}
    >
      <TagIcon className="size-3 shrink-0" strokeWidth={2.2} />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove label ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 rounded-sm p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </span>
  );
}
