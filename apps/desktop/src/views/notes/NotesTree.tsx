/**
 * Folders and Tags trees for the notes browser (R42): one WAI-ARIA tree, one tab stop, roving
 * focus. Controlled: the view owns the expanded set and the selection (both persisted per device).
 */
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TreeNode } from "@/lib/ui-contract";
import { cn } from "@/lib/utils";
import { flattenTree, selectNode, treeKeyAction, typeAhead, visibleFocus, type FlatItem, type TreeSelection } from "./tree";

interface Props {
  mode: "folders" | "tags";
  onModeChange: (mode: "folders" | "tags") => void;
  headerAction?: ReactNode;
  folders: TreeNode;
  tags: TreeNode;
  expanded: ReadonlySet<string>;
  onExpandedChange: (id: string, open: boolean) => void;
  selection: TreeSelection;
  onSelect: (next: TreeSelection) => void;
}

const isSelected = (id: string, sel: TreeSelection) =>
  id === "f:" ? sel.folder === null : id.startsWith("f:") ? sel.folder === id.slice(2) : id.startsWith("t:") ? sel.tag === id.slice(2) : false;

export function NotesTree({ mode, onModeChange, headerAction, ...props }: Props) {
  return (
    <Tabs value={mode} onValueChange={value => onModeChange(value === "tags" ? "tags" : "folders")} className="h-full min-h-0 gap-0">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <TabsList aria-label="Browse notes by" className="min-w-0 flex-1">
          <TabsTrigger value="folders" className="font-mono text-xs text-muted-foreground">Folders</TabsTrigger>
          <TabsTrigger value="tags" className="font-mono text-xs text-muted-foreground">Tags</TabsTrigger>
        </TabsList>
        {headerAction}
      </div>
      {(["folders", "tags"] as const).map(tab => (
        <TabsContent key={tab} value={tab} className="m-0 min-h-0 overflow-y-auto py-2">
          <NotesTreePanel {...props} mode={tab} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function NotesTreePanel({ mode, folders, tags, expanded, onExpandedChange, selection, onSelect }: Omit<Props, "onModeChange" | "headerAction">) {
  const items = useMemo(() => flattenTree(folders, tags, new Set([...expanded, "s:folders", "s:tags"]))
    .filter(item => item.id.startsWith(mode === "folders" ? "f:" : "t:"))
    .map(item => ({ ...item, level: item.level - 1, parent: item.parent?.startsWith("s:") ? null : item.parent })), [folders, tags, expanded, mode]);
  const [focus, setFocus] = useState<string | null>(null);
  // Before the first move, the tab stop sits on the selected tag, else the selected folder.
  const initial = mode === "tags" ? selection.tag !== null ? `t:${selection.tag}` : null : selection.folder ? `f:${selection.folder}` : "f:";
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

  if (!items.length) return <p role="status" className="px-3 py-4 text-xs text-muted-foreground">No tags yet.</p>;
  return (
    <div ref={treeRef} role="tree" aria-label={mode === "folders" ? "Folders" : "Tags"} onKeyDown={onKeyDown} className="py-1 outline-none">
      {items.map((it) => {
        const open = it.hasChildren && expanded.has(it.id);
        const sel = isSelected(it.id, selection);
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
            aria-selected={sel}
            aria-setsize={sizes.sizeOf.get(it.parent)}
            aria-posinset={sizes.pos.get(it.id)}
            tabIndex={it.id === active ? 0 : -1}
            title={it.label}
            onFocus={() => setFocus(it.id)}
            onClick={() => {
              setFocus(it.id);
              activate(it);
            }}
            style={{ paddingLeft: `${4 + (it.level - 1) * 12}px` }}
            className={cn(
              "mx-1.5 flex h-7 cursor-default items-center gap-1 rounded-md pr-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
              "text-[13px] hover:bg-muted/70",
              sel && "bg-muted font-medium text-foreground",
            )}
          >
              <>
                {it.hasChildren ? (
                  <span aria-hidden onClick={toggle} className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">
                    <ChevronRightIcon className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
                  </span>
                ) : (
                  <span aria-hidden className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">{it.count}</span>
              </>
          </div>
        );
      })}
    </div>
  );
}
