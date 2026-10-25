/**
 * Folders and Tags trees for the notes browser (R42): one WAI-ARIA tree, one tab stop, roving
 * focus. Controlled: the view owns the expanded set and the selection (both persisted per device).
 */
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { TreeNode } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";
import { flattenTree, selectNode, treeKeyAction, typeAhead, visibleFocus, type FlatItem, type TreeSelection } from "./tree";

interface Props {
  folders: TreeNode;
  tags: TreeNode;
  expanded: ReadonlySet<string>;
  onExpandedChange: (id: string, open: boolean) => void;
  selection: TreeSelection;
  onSelect: (next: TreeSelection) => void;
}

const isSelected = (id: string, sel: TreeSelection) =>
  id === "f:" ? sel.folder === null : id.startsWith("f:") ? sel.folder === id.slice(2) : id.startsWith("t:") ? sel.tag === id.slice(2) : false;

export function NotesTree({ folders, tags, expanded, onExpandedChange, selection, onSelect }: Props) {
  const items = useMemo(() => flattenTree(folders, tags, expanded), [folders, tags, expanded]);
  const [focus, setFocus] = useState<string | null>(null);
  // Before the first move, the tab stop sits on the selected tag, else the selected folder.
  const initial = selection.tag !== null ? `t:${selection.tag}` : selection.folder ? `f:${selection.folder}` : "f:";
  const active = visibleFocus(items, focus ?? initial);
  const treeRef = useRef<HTMLDivElement>(null);
  const typed = useRef<{ buf: string; timer?: ReturnType<typeof setTimeout> }>({ buf: "" });

  // Keep DOM focus on the active row while the tree has focus (also after a collapse hides it).
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || !active || !tree.contains(document.activeElement)) return;
    const el = tree.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    if (el && el !== document.activeElement) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  const sizes = useMemo(() => {
    const sizeOf = new Map<string | null, number>();
    const pos = new Map<string, number>();
    for (const it of items) {
      const n = (sizeOf.get(it.parent) ?? 0) + 1;
      sizeOf.set(it.parent, n);
      pos.set(it.id, n);
    }
    return { sizeOf, pos };
  }, [items]);

  const activate = (it: FlatItem) => {
    const next = selectNode(it.id, selection);
    if (next) onSelect(next);
    else onExpandedChange(it.id, !expanded.has(it.id));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = typed.current;
    if (e.key.length === 1 && e.key !== " ") {
      clearTimeout(t.timer);
      t.buf += e.key;
      t.timer = setTimeout(() => (t.buf = ""), 500);
      const id = typeAhead(items, active, t.buf);
      if (id) setFocus(id);
      e.preventDefault();
      return;
    }
    const a = treeKeyAction(items, active, e.key, expanded);
    if (!a) return;
    e.preventDefault();
    if (a.focus) setFocus(a.focus);
    if (a.expand) onExpandedChange(a.expand, true);
    if (a.collapse) onExpandedChange(a.collapse, false);
    if (a.select) {
      const it = items.find((x) => x.id === a.select);
      if (it) activate(it);
    }
  };

  return (
    <div ref={treeRef} role="tree" aria-label="Folders and tags" aria-multiselectable="true" onKeyDown={onKeyDown} className="py-1 outline-none">
      {items.map((it) => {
        const section = it.level === 1;
        const open = it.hasChildren && expanded.has(it.id);
        const sel = !section && isSelected(it.id, selection);
        const toggle = (e: MouseEvent) => {
          e.stopPropagation();
          onExpandedChange(it.id, !open);
        };
        return (
          <div
            key={it.id}
            data-id={it.id}
            role="treeitem"
            aria-level={it.level}
            aria-expanded={it.hasChildren ? open : undefined}
            aria-selected={section ? undefined : sel}
            aria-setsize={sizes.sizeOf.get(it.parent)}
            aria-posinset={sizes.pos.get(it.id)}
            tabIndex={it.id === active ? 0 : -1}
            title={section ? undefined : it.label}
            onFocus={() => setFocus(it.id)}
            onClick={() => {
              setFocus(it.id);
              activate(it);
            }}
            style={section ? undefined : { paddingLeft: `${4 + (it.level - 2) * 12}px` }}
            className={cn(
              "mx-1.5 flex h-7 cursor-default items-center gap-1 rounded-md pr-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
              section ? "mt-2 px-2 text-micro font-medium tracking-wide text-muted-foreground uppercase first:mt-0 hover:text-foreground" : "text-small hover:bg-row-hover",
              sel && "bg-accent font-medium text-accent-foreground hover:bg-accent",
            )}
          >
            {section ? (
              <>
                <span className="flex-1 truncate">{it.label}</span>
                <ChevronRightIcon aria-hidden className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
              </>
            ) : (
              <>
                {it.hasChildren ? (
                  <span aria-hidden onClick={toggle} className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">
                    <ChevronRightIcon className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
                  </span>
                ) : (
                  <span aria-hidden className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className="ml-2 shrink-0 text-micro text-muted-foreground tabular-nums">{it.count}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
