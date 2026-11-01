/** Read-only reader for one file of the notes space (R22): rendered Markdown + "Open in" (R41). */
import { FileTextIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { RelTime, useNow } from "@/components/agent/primitives";
import { EmptyState } from "@/components/shared/EmptyState";
import { OpenInButton } from "@/components/shared/OpenIn";
import { useOpenHotkey } from "@/components/shared/open-in";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNoteFile } from "@/lib/hooks";
import type { NoteFile } from "@/lib/types";
import { Markdown } from "./Markdown";

export function NoteFileReader({ path, fallback, onClose }: { path: string; fallback?: NoteFile; onClose?: () => void }) {
  const q = useNoteFile(path);
  const now = useNow();
  const file = q.data ?? fallback;
  useOpenHotkey(file?.abs_path);

  if (!file && q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!file) {
    return (
      <EmptyState
        compact
        icon={q.error ? TriangleAlertIcon : FileTextIcon}
        tone="muted"
        title="File not found"
        description={`${path} may have been moved or deleted.`}
      />
    );
  }

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={file.title}>
      <header className="flex shrink-0 items-start gap-3 border-b px-7 py-6 md:px-10">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-[28px] leading-tight font-medium tracking-tight text-foreground">{file.title}</h1>
          <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="truncate font-mono" title={file.abs_path}>
              {file.path}
            </span>
            {file.modified && (
              <span className="tabular-nums">
                · <RelTime iso={file.modified} now={now} />
              </span>
            )}
            {file.id && <span className="rounded bg-muted px-1 font-mono text-xs">{file.id}</span>}
          </p>
          {file.tags.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {file.tags.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2 py-0.5">#{t}</span>
              ))}
            </p>
          )}
        </div>
        <OpenInButton absPath={file.abs_path} />
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="text-muted-foreground">
            <XIcon />
          </Button>
        )}
      </header>
      <div data-detail-scroll className="min-h-0 flex-1 overflow-y-auto px-7 py-7 md:px-10 md:py-9">
        {q.data?.body === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : q.data.body.trim() ? (
          <Markdown className="mx-auto max-w-3xl font-sans text-[15px] leading-[1.7]">{q.data.body}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">This file is empty.</p>
        )}
      </div>
    </article>
  );
}
