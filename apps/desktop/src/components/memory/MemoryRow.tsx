/** One memory in the list: kind tile, title, importance, provenance and state badges. */
import { ArrowRightIcon, FolderIcon, LinkIcon } from "lucide-react";
import { forwardRef } from "react";
import { MemberAvatar } from "@/components/shared/Avatar";
import { useMemberMap } from "@/lib/hooks";
import { relativeTime } from "@/lib/dates";
import type { Memory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExpiryBadge, ImportanceDots, KindIcon, ScopeBadge } from "./badges";
import { expiryState, isSuperseded } from "./memory-utils";

export interface MemoryRowProps {
  memory: Memory;
  selected?: boolean;
  successor?: Memory;
  projectTitle?: string;
  now?: Date;
  onSelect: () => void;
}

export const MemoryRow = forwardRef<HTMLButtonElement, MemoryRowProps>(function MemoryRow({ memory: m, selected, successor, projectTitle, now, onSelect }, ref) {
  const members = useMemberMap();
  const superseded = isSuperseded(m);
  const expired = expiryState(m.expires, now) === "expired";
  const owner = m.owner ? (members.get(m.owner)?.name ?? m.owner) : null;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      data-selected={selected || undefined}
      className={cn(
        "group/row relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        "hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent",
        (superseded || expired) && "opacity-70",
      )}
    >
      {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
      <KindIcon kind={m.kind} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className={cn("min-w-0 flex-1 text-[14px] leading-snug font-medium text-foreground", superseded && "line-through decoration-muted-foreground/60")}>
            {m.title}
          </span>
          <ImportanceDots value={m.importance} className="mt-1.5 shrink-0" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {m.owner && (
            <span className="inline-flex items-center gap-1">
              <MemberAvatar id={m.owner} size="xs" />
              <span className="max-w-28 truncate">{owner}</span>
            </span>
          )}
          <span className="tabular-nums">{relativeTime(m.updated, now)}</span>
          <ScopeBadge scope={m.scope} />
          <ExpiryBadge expires={m.expires} now={now} hideFuture />
          {projectTitle && (
            <span className="inline-flex max-w-36 items-center gap-1 truncate">
              <FolderIcon className="size-3 shrink-0" />
              <span className="truncate">{projectTitle}</span>
            </span>
          )}
          {m.source && (
            <span className="inline-flex max-w-44 items-center gap-1" title={`Source: ${m.source}`}>
              <LinkIcon className="size-3 shrink-0" />
              <span className="truncate">{m.source}</span>
            </span>
          )}
          {m.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-muted-foreground/80">
              #{t}
            </span>
          ))}
          {superseded && (
            <span className="inline-flex max-w-52 items-center gap-1 text-foreground/70">
              <ArrowRightIcon className="size-3 shrink-0" />
              <span className="truncate">{successor ? successor.title : m.superseded_by}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
