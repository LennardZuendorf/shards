import { BotIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hueFromString, initials } from "@/lib/color";
import { guessMemberKind } from "@/lib/api/host";
import { useMemberMap } from "@/lib/hooks";
import type { MemberKind } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE: Record<AvatarSize, { box: string; text: string; icon: string }> = {
  xs: { box: "size-4", text: "text-[8px]", icon: "size-2.5" },
  sm: { box: "size-5", text: "text-[9px]", icon: "size-3" },
  md: { box: "size-7", text: "text-[11px]", icon: "size-4" },
  lg: { box: "size-10", text: "text-sm", icon: "size-5" },
};

export interface AvatarProps {
  id: string;
  name?: string | null;
  kind?: MemberKind;
  /** Explicit CSS color (member config); otherwise a hue derived from the id. */
  color?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Show a tooltip with the name and kind. */
  tooltip?: boolean;
  /** Pulse ring (agent currently working). */
  active?: boolean;
}

/**
 * Humans: circle with initials. Agents: rounded square with a bot glyph. Hue from the id hash,
 * so the same identity always has the same color in light and dark.
 */
export function Avatar({ id, name, kind, color, size = "sm", className, tooltip = false, active }: AvatarProps) {
  const k = kind ?? guessMemberKind(id);
  const s = SIZE[size];
  const style = { "--av-h": String(hueFromString(id)), ...(color ? { "--av-c": color } : {}) } as CSSProperties;
  const display = name || id;
  const node = (
    <span
      data-kind={k}
      style={style}
      aria-label={`${display} (${k})`}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-semibold select-none",
        s.box,
        k === "agent"
          ? "rounded-[30%] text-white bg-[oklch(0.6_0.12_var(--av-h))] dark:bg-[oklch(0.55_0.12_var(--av-h))]"
          : "rounded-full text-[oklch(0.38_0.12_var(--av-h))] bg-[oklch(0.92_0.05_var(--av-h))] dark:text-[oklch(0.9_0.06_var(--av-h))] dark:bg-[oklch(0.38_0.08_var(--av-h))]",
        color && (k === "agent" ? "bg-(--av-c)! text-white" : "bg-(--av-c)! text-white!"),
        "ring-2 ring-background",
        active && "after:absolute after:-inset-0.75 after:animate-pulse-dot after:rounded-[inherit] after:border-2 after:border-status-working",
        className,
      )}
    >
      {k === "agent" ? <BotIcon className={s.icon} strokeWidth={2.2} /> : <span className={cn("leading-none", s.text)}>{initials(display)}</span>}
    </span>
  );
  if (!tooltip) return node;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {display}
        <span className="ml-1 opacity-60">{k === "agent" ? "· agent" : ""}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Avatar for a member id, resolved through `host_members` (name, kind, color). */
export function MemberAvatar({ id, ...rest }: Omit<AvatarProps, "name" | "kind" | "color">) {
  const m = useMemberMap().get(id);
  return <Avatar id={id} name={m?.name} kind={m?.kind} color={m?.color} {...rest} />;
}

/** Overlapping stack of avatars (owner + delegate, project members). */
export function AvatarStack({ ids, size = "sm", max = 3 }: { ids: string[]; size?: AvatarSize; max?: number }) {
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((id) => (
        <MemberAvatar key={id} id={id} size={size} tooltip />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-background", SIZE[size].box)}>
          +{rest}
        </span>
      )}
    </span>
  );
}
