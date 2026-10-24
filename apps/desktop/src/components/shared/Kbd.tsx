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
          <span key={i} className="px-0.5 text-micro text-muted-foreground">
            then
          </span>
        ) : (
          <kbd
            key={i}
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 font-sans text-micro leading-none font-medium",
              inverted ? "border-[1px] border-white/25 bg-white/15 text-current" : "bg-surface-2 text-foreground",
            )}
          >
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}
