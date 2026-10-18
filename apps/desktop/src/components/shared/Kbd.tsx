import { cn } from "@/lib/utils";
import { formatKeys } from "@/lib/hotkeys";

export interface KbdProps {
  /** Hotkey string as registered: `"mod+k"`, `"q"`, `"g t"`. */
  keys: string;
  className?: string;
  /** Lighter look for use on primary/colored surfaces. */
  inverted?: boolean;
}

/** Keyboard shortcut hint: `<Kbd keys="mod+k" />` → ⌘ K. */
export function Kbd({ keys, className, inverted }: KbdProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {formatKeys(keys).map((k, i) =>
        k === "then" ? (
          <span key={i} className="px-0.5 text-[10px] text-muted-foreground">
            then
          </span>
        ) : (
          <kbd
            key={i}
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border px-1 font-sans text-[10.5px] leading-none font-medium",
              inverted
                ? "border-white/25 bg-white/15 text-current"
                : "border-border bg-muted/70 text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
            )}
          >
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}
