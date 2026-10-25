/** Memory links panel: outgoing `[[wikilinks]]` and the entities that reference this memory. */
import {
  AlertTriangleIcon,
  CheckSquareIcon,
  ChevronRightIcon,
  FileTextIcon,
  HelpCircleIcon,
  PaperclipIcon,
} from "lucide-react";
import { useMemo } from "react";
import { openTask } from "@/app/detail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { navigate, paths } from "@/lib/router";
import type { Asset, GraphNode, Memory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KindIcon, kindMeta } from "./badges";
import { useAssetIndex, useMemoryLinks } from "./hooks";
import {
  backlinkSources,
  outgoingTargets,
  resolveTarget,
  sortLinks,
  visibleLinks,
  type LinkTarget,
} from "./memory-links";

export interface MemoryLinksProps {
  memory: Memory;
  /** Every memory, so titles resolve before the graph call returns. */
  all?: Memory[];
  onNavigate: (id: string) => void;
}

export function MemoryLinks({ memory, all = [], onNavigate }: MemoryLinksProps) {
  const q = useMemoryLinks(memory.id);
  const needsAssets = (memory.related ?? []).some((id) => id.startsWith("a-"));
  const assetsQ = useAssetIndex(needsAssets);
  const memories = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const nodes = useMemo(() => new Map<string, GraphNode>((q.data?.nodes ?? []).map((n) => [n.id, n])), [q.data]);
  const assets = useMemo(() => new Map<string, Asset>((assetsQ.data ?? []).map((a) => [a.id, a])), [assetsQ.data]);
  const outgoing = useMemo(
    () => outgoingTargets(memory.related, memories, nodes, memory.id, assets),
    [memory.related, memory.id, memories, nodes, assets],
  );
  const backlinks = useMemo(
    () =>
      sortLinks(
        backlinkSources(memory.id, q.data?.nodes ?? [], q.data?.edges ?? []).map((n) =>
          resolveTarget(n.id, memories, nodes, assets),
        ),
      ),
    [memory.id, memories, nodes, assets, q.data],
  );

  return (
    <MemoryLinksView
      outgoing={outgoing}
      backlinks={backlinks}
      loading={q.isLoading}
      error={q.isError}
      onRetry={() => void q.refetch()}
      onOpen={(id) => openLinked(id, onNavigate)}
    />
  );
}

export interface MemoryLinksViewProps {
  outgoing: LinkTarget[];
  backlinks: LinkTarget[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpen: (id: string) => void;
}

export function MemoryLinksView({ outgoing, backlinks, loading, error, onRetry, onOpen }: MemoryLinksViewProps) {
  const out = visibleLinks(outgoing);
  const back = visibleLinks(backlinks);

  if (!outgoing.length && !backlinks.length && !loading && !error) {
    return (
      <section>
        <h3 className="mb-2 text-small font-semibold">Links</h3>
        <p className="px-1 text-xs text-muted-foreground">
          No links yet. Mention <code className="font-mono">[[id]]</code> in Details to link another entity.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-2 text-small font-semibold">Links</h3>

      {out.visible.length > 0 && (
        <>
          <ul className="mb-1 space-y-0.5">
            {out.visible.map((target) => (
              <li key={target.id}>
                <LinkRow target={target} onOpen={onOpen} pending={loading || error} />
              </li>
            ))}
          </ul>
          {out.hidden > 0 && <p className="px-2 pb-1 text-micro text-muted-foreground">and {out.hidden} more</p>}
        </>
      )}

      <h4 className="mb-1 mt-3 text-micro font-medium uppercase tracking-wide text-muted-foreground">
        Referenced by
      </h4>
      {loading ? (
        <div className="space-y-1.5 px-1">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          Couldn’t load backlinks.
          {onRetry && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      ) : back.visible.length > 0 ? (
        <>
          <ul className="space-y-0.5">
            {back.visible.map((target) => (
              <li key={target.id}>
                <LinkRow target={target} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          {back.hidden > 0 && <p className="px-2 pt-1 text-micro text-muted-foreground">and {back.hidden} more</p>}
        </>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Nothing links here yet.</p>
      )}
    </section>
  );
}

function LinkRow({ target, onOpen, pending }: { target: LinkTarget; onOpen: (id: string) => void; pending?: boolean }) {
  // While the graph is loading or has failed, an unresolved note/task id is not necessarily
  // dangling: suppress the broken-link treatment so a valid link never flashes as missing.
  const missing = target.missing && !pending;
  const label = target.kind === "memory" ? kindMeta(target.subtype).label : target.subtype;
  const body = (
    <>
      <LinkIcon target={target} />
      <span className={cn("min-w-0 flex-1 truncate text-small", missing && "italic text-muted-foreground")}>
        {missing ? target.id : target.title}
      </span>
      {label && <span className="shrink-0 text-micro text-muted-foreground">{label}</span>}
      <span className="shrink-0 font-mono text-micro text-muted-foreground">{target.id}</span>
      {missing ? (
        <AlertTriangleIcon className="size-3.5 shrink-0 text-warning" aria-label="Target not found" />
      ) : (
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  if (missing) {
    return (
      <div aria-disabled="true" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(target.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  );
}

function LinkIcon({ target }: { target: LinkTarget }) {
  if (target.kind === "memory") return <KindIcon kind={target.subtype ?? "fact"} size="sm" />;
  const Icon =
    target.kind === "task"
      ? CheckSquareIcon
      : target.kind === "asset"
        ? PaperclipIcon
        : target.kind === "note"
          ? FileTextIcon
          : HelpCircleIcon;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Memories navigate via the view's handler; tasks open the pane; notes use the route. */
function openLinked(id: string, onNavigate: (id: string) => void) {
  if (id.startsWith("m-")) onNavigate(id);
  else if (id.startsWith("t-")) openTask(id);
  else if (id.startsWith("n-")) navigate(paths.notes(id));
}
