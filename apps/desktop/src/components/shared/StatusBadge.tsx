import { CheckIcon, CircleAlertIcon, HandIcon, LoaderIcon, MoonIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSION_LABEL } from "@/lib/status";
import type { AgentSessionState } from "@/lib/types";

const STYLE: Record<AgentSessionState, { cls: string; dot: string; Icon: typeof CheckIcon }> = {
  working: { cls: "text-status-working bg-status-working/10 ring-status-working/25", dot: "bg-status-working", Icon: LoaderIcon },
  awaiting: { cls: "text-status-awaiting bg-status-awaiting/12 ring-status-awaiting/30", dot: "bg-status-awaiting", Icon: HandIcon },
  done: { cls: "text-status-done bg-status-done/10 ring-status-done/25", dot: "bg-status-done", Icon: CheckIcon },
  error: { cls: "text-status-error bg-status-error/10 ring-status-error/25", dot: "bg-status-error", Icon: CircleAlertIcon },
  idle: { cls: "text-muted-foreground bg-muted ring-border", dot: "bg-muted-foreground/50", Icon: MoonIcon },
};

export interface StatusBadgeProps {
  state: AgentSessionState;
  className?: string;
  /** Dot only (dense rows). */
  compact?: boolean;
  label?: string;
}

/** Agent session state: working / awaiting input / done / error (D4). */
export function StatusBadge({ state, className, compact, label }: StatusBadgeProps) {
  const s = STYLE[state];
  const text = label ?? SESSION_LABEL[state];
  if (compact) {
    return (
      <span title={text} className={cn("relative inline-flex size-2 shrink-0 rounded-full", s.dot, className)}>
        {state === "working" && <span className="absolute inset-0 animate-ping rounded-full bg-status-working/60" />}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-micro font-medium whitespace-nowrap ring-1 ring-inset",
        s.cls,
        className,
      )}
    >
      <s.Icon className={cn("size-3", state === "working" && "animate-spin [animation-duration:2s]")} strokeWidth={2.4} />
      {text}
    </span>
  );
}
