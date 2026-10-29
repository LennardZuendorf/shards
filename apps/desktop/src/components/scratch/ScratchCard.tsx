/** Scratchpad card: name, liveness, size, checklist progress and a short preview. */
import { FileTextIcon } from "lucide-react";
import { forwardRef } from "react";
import { LiveDot } from "@/components/agent/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/dates";
import type { Scratch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { byteLength, formatBytes, liveness, parseChecklist, previewText } from "./scratch-utils";

export const ScratchCard = forwardRef<
  HTMLButtonElement,
  { item: Scratch; full?: Scratch; selected?: boolean; now: Date; onSelect: () => void }
>(function ScratchCard({ item, full, selected, now, onSelect }, ref) {
  const body = full?.body;
  const live = liveness(full?.updated ?? item.updated, now);
  const check = parseChecklist(body);
  const preview = previewText(body, 3);
  const bytes = full ? byteLength(body) : item.bytes;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-[18px] border border-border/70 bg-card px-3.5 py-3 text-left shadow-sm transition-[background-color,box-shadow] outline-none",
        "hover:bg-muted/30 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring",
        selected && "bg-muted/55 shadow-md",
        live === "stale" && "opacity-75",
      )}
    >
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">{item.name}</span>
        {live === "live" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-working">
            <LiveDot /> live
          </span>
        ) : (
          <span className={cn("text-xs tabular-nums", live === "active" ? "text-status-working" : "text-muted-foreground")}>
            {relativeTime(full?.updated ?? item.updated, now)}
          </span>
        )}
      </div>
      {full === undefined ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : preview ? (
        <p className="line-clamp-3 text-[12.5px] leading-relaxed whitespace-pre-line text-muted-foreground">{preview}</p>
      ) : (
        <p className="text-[12.5px] text-muted-foreground/70 italic">Empty</p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {check.total > 0 && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5" title={`${check.done} of ${check.total} done`}>
            <span className="h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-status-done transition-[width]" style={{ width: `${(check.done / check.total) * 100}%` }} />
            </span>
            <span className="tabular-nums">
              {check.done}/{check.total}
            </span>
          </span>
        )}
        <span className={cn("tabular-nums", check.total === 0 && "ml-auto")}>{formatBytes(bytes)}</span>
        {live === "stale" && <span className="rounded bg-muted px-1">stale</span>}
      </div>
    </button>
  );
});
