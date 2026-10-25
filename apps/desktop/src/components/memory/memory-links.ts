/**
 * Pure memory link helpers: resolve `related` ids and reverse-graph sources into displayable
 * link targets. No React, no I/O — everything here is vitest-testable.
 */
import type { Asset, GraphNode, Memory } from "@/lib/types";

export type LinkKind = "memory" | "note" | "task" | "asset" | "unknown";

export interface LinkTarget {
  id: string;
  kind: LinkKind;
  title: string;
  /** Memory kind or note/task type, when the source knows it. */
  subtype?: string;
  /** True when neither the memory list nor the graph knows the id. */
  missing: boolean;
}

const PREFIX_KIND: Record<string, LinkKind> = { m: "memory", n: "note", t: "task", a: "asset" };

/** The entity family an id names. Ids are hash-prefixed by space, so this is authoritative. */
export function linkKindOfId(id: string): LinkKind {
  return PREFIX_KIND[id.slice(0, 1)] ?? "unknown";
}

const KIND_RANK: Record<LinkKind, number> = { memory: 0, note: 1, task: 2, asset: 3, unknown: 4 };

const byTitle = (a: LinkTarget, b: LinkTarget): number => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

/** Resolve one id against the loaded memories, graph nodes and assets, degrading to the raw id. */
export function resolveTarget(
  id: string,
  memories: ReadonlyMap<string, Memory>,
  nodes: ReadonlyMap<string, GraphNode>,
  assets: ReadonlyMap<string, Asset> = new Map(),
): LinkTarget {
  const memory = memories.get(id);
  if (memory) return { id, kind: "memory", title: memory.title, subtype: memory.kind, missing: false };
  const node = nodes.get(id);
  if (node) {
    return {
      id,
      kind: linkKindOfId(id),
      title: node.title ?? id,
      subtype: node.kind ?? node.type,
      missing: false,
    };
  }
  // Assets are outside the graph corpus, so `[[a-id]]` never resolves through `nodes`.
  const asset = assets.get(id);
  if (asset) return { id, kind: "asset", title: asset.title, subtype: asset.media_type, missing: false };
  return { id, kind: linkKindOfId(id), title: id, missing: true };
}

/**
 * The memory's outgoing `related` list, in author order. Dangling ids are kept so the pane can
 * show a broken link; the seed itself is skipped.
 */
export function outgoingTargets(
  related: readonly string[] | undefined,
  memories: ReadonlyMap<string, Memory>,
  nodes: ReadonlyMap<string, GraphNode>,
  seedId: string,
  assets: ReadonlyMap<string, Asset> = new Map(),
): LinkTarget[] {
  const seen = new Set<string>([seedId]);
  const out: LinkTarget[] = [];
  for (const id of related ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(resolveTarget(id, memories, nodes, assets));
  }
  return out;
}

/**
 * Every node that names the seed in `related`. `edges` catch a plain inbound link; the
 * `related` check catches a mutual link, whose inbound edge is suppressed because the
 * traversal already consumed it as an outbound one.
 */
export function backlinkSources(
  seedId: string,
  nodes: readonly GraphNode[],
  edges: readonly (readonly [string, string])[],
): GraphNode[] {
  const inbound = new Set<string>();
  for (const [from, to] of edges) if (to === seedId) inbound.add(from);
  const seen = new Set<string>([seedId]);
  const out: GraphNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    if (inbound.has(node.id) || (node.related ?? []).includes(seedId)) {
      seen.add(node.id);
      out.push(node);
    }
  }
  return out;
}

/** Deterministic display order: memory, note, task, asset, unknown, then title, then id. */
export function sortLinks(targets: readonly LinkTarget[]): LinkTarget[] {
  return [...targets].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || byTitle(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Cap a long list (a hub memory can be referenced by hundreds) and report what was hidden. */
export function visibleLinks<T>(links: readonly T[], cap = 10): { visible: T[]; hidden: number } {
  return links.length <= cap
    ? { visible: [...links], hidden: 0 }
    : { visible: links.slice(0, cap), hidden: links.length - cap };
}
