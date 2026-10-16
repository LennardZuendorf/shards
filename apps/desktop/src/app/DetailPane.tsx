import { XIcon } from "lucide-react";
import { Component, createElement, Suspense, useEffect, useState, type ReactNode } from "react";
import { DeadlineChip, DueChip } from "@/components/shared/DueChip";
import { LabelChip } from "@/components/shared/LabelChip";
import { MemberAvatar } from "@/components/shared/Avatar";
import { PriorityFlag } from "@/components/shared/PriorityFlag";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useTask } from "@/lib/hooks";
import { statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useDetail, useDetailRenderer, type DetailKind, type DetailRendererProps } from "./detail";

/**
 * Feature modules register their renderer on import. Load the module for a kind on demand, so
 * `?open=<kind>:…` works on every route without pulling every viewer into the main chunk.
 */
const loaders: Partial<Record<DetailKind, () => Promise<unknown>>> = {
  task: () => import("@/components/task/register"),
  memory: () => import("@/components/memory/register"),
  note: () => import("@/components/note/register"),
  scratch: () => import("@/components/scratch/register"),
};
const requested = new Set<DetailKind>();
function ensureRenderer(kind: DetailKind | undefined) {
  if (!kind || requested.has(kind)) return;
  requested.add(kind);
  loaders[kind]?.().catch(() => requested.delete(kind));
}

function LoadingDetail() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Read-only fallback until a feature module registers a renderer for the kind. */
function FallbackDetail({ target, onClose }: DetailRendererProps) {
  const task = useTask(target.kind === "task" ? target.id : null);
  const t = task.data;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <span className="font-mono text-xs text-muted-foreground">{target.id}</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Close">
          <XIcon />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {target.kind !== "task" ? (
          <p className="text-sm text-muted-foreground">No viewer for {target.kind} yet.</p>
        ) : task.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !t ? (
          <p className="text-sm text-muted-foreground">Task not found.</p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg leading-snug font-semibold">{t.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{statusLabel(t)}</span>
              <PriorityFlag priority={t.priority} withLabel />
              <DueChip due={t.due} recur={t.recur} recurFrom={t.recur_from} />
              <DeadlineChip deadline={t.deadline} />
              {t.owner && (
                <span className="inline-flex items-center gap-1">
                  <MemberAvatar id={t.owner} size="xs" /> {t.owner}
                </span>
              )}
            </div>
            {t.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {t.tags.map((x) => (
                  <LabelChip key={x} name={x} size="md" />
                ))}
              </div>
            )}
            {t.body?.trim() && <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{t.body.trim()}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

class PaneBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  render() {
    if (this.state.error) return <div className="p-5 text-sm text-destructive">Couldn’t render this item: {this.state.error.message}</div>;
    return this.props.children;
  }
}

function useWide() {
  const q = "(min-width: 1100px)";
  const [wide, setWide] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : true));
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Right-hand detail pane. Wide windows: an inline column that slides in beside the list
 * (the list stays interactive). Narrow windows: a sheet.
 */
export function DetailPane() {
  const { target, close } = useDetail();
  ensureRenderer(target?.kind);
  const registered = useDetailRenderer(target?.kind);
  const Renderer = registered ?? (target && loaders[target.kind] ? LoadingDetail : FallbackDetail);
  const wide = useWide();
  const [last, setLast] = useState(target);
  if (target && target !== last) setLast(target);
  const shown = target ?? last;

  const body = shown ? (
    <PaneBoundary resetKey={`${shown.kind}:${shown.id}`}>
      <Suspense fallback={<Skeleton className="m-5 h-40" />}>
        {createElement(Renderer, { key: `${shown.kind}:${shown.id}`, target: shown, id: shown.id, onClose: close })}
      </Suspense>
    </PaneBoundary>
  ) : null;

  if (!wide) {
    return (
      <Sheet open={!!target} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="right"
          className="w-full p-0 outline-none focus-visible:outline-none sm:max-w-md"
          showCloseButton={false}
          // Focus the first control (title field, close button …), not the panel itself, so the
          // focus ring lands on something the user can act on.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const root = e.currentTarget as HTMLElement | null;
            // The renderer may still be loading: retry briefly until a control exists.
            let tries = 0;
            const tick = () => {
              const el = root?.querySelector<HTMLElement>(
                '[data-autofocus], textarea, input:not([type=hidden]), [contenteditable="true"], button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
              );
              if (el) el.focus({ preventScroll: true });
              else if (tries++ < 20) window.setTimeout(tick, 50);
            };
            requestAnimationFrame(tick);
          }}
        >
          <SheetTitle className="sr-only">Details</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <aside
      aria-label="Details"
      aria-hidden={!target}
      className={cn(
        "relative h-full shrink-0 overflow-hidden border-l bg-background transition-[width,opacity] duration-200 ease-out",
        target ? "w-[440px] opacity-100" : "w-0 border-l-0 opacity-0",
      )}
      onTransitionEnd={() => !target && setLast(null)}
    >
      {/* Pinned to the right edge at its final width: the opening transition reveals the
          content instead of sliding it, so skeleton and content never shift sideways. */}
      <div className="absolute inset-y-0 right-0 w-[440px]">{body}</div>
    </aside>
  );
}
