/**
 * P20 — command palette, keyboard-first: a palette action runs against the **selection**, and the
 * open → act → close path needs no pointer.
 *
 * There is no DOM on this host (no jsdom, no testing-library; see the desktop README), so the real
 * `CommandPalette` and the real `AppShell` are rendered with `renderToStaticMarkup` and the pieces
 * that need a browser are replaced by recorders:
 *
 * - `@/components/ui/command` — cmdk/dialog primitives. The recorder keeps each item's `value` +
 *   `onSelect` and the dialog's `open`/`onOpenChange`, and renders the list only while open (as the
 *   dialog does), so "closed" really means "no items to act on".
 * - `@/lib/hotkeys` — the window keydown registry. The recorder keeps each binding's key string and
 *   handler, so a test can invoke exactly what a keypress would invoke.
 * - `@/app/ui-store` — the toggle store, re-implemented with a `getServerSnapshot` (the shipped store
 *   passes none, which React 19 rejects on the server); same contract: `set`, `toggle`, `use`.
 * - data hooks and the task-action surface are stubbed; the *decision* code (selection resolution,
 *   `handoffContext` eligibility, palette close + query reset) is the shipped code.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, Task } from "@/lib/types";

/* ---------------------------------------------------------------- fixtures */

const members: Member[] = [
  { id: "lennard", name: "Lennard", kind: "human" },
  { id: "claude", name: "Claude", kind: "agent" },
  { id: "codex", name: "Codex", kind: "agent" },
];

/** Two own tasks (one open → hand off, one delegated → take back) and a neighbour to mis-target. */
const tasks: Task[] = [
  { id: "t-open", title: "Ship the slice", owner: "lennard", status: "open", claimed_by: null },
  { id: "t-delegated", title: "Review the diff", owner: "lennard", status: "claimed", claimed_by: "claude" },
  { id: "t-neighbour", title: "Something else", owner: "codex", status: "open", claimed_by: null },
].map((over) => ({
  type: "task" as const,
  tags: [],
  created: "2026-11-01T00:00:00Z",
  updated: "2026-11-01T00:00:00Z",
  priority: "normal" as const,
  project: null,
  blocks: [],
  blocked_by: [],
  ...over,
})) as Task[];

const byId = (id: string) => tasks.find((t) => t.id === id) ?? null;

/* --------------------------------------------------------------- recorders */

const rec = vi.hoisted(() => ({
  /** The dialog's current `open` prop (null before the first render). */
  open: null as boolean | null,
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  /** value → onSelect, in document order, cleared each render. */
  items: new Map<string, () => void>(),
  /** Group headings, in document order. */
  groups: [] as string[],
  /** The search box's current value. */
  query: "",
  reset() {
    this.open = null;
    this.onOpenChange = undefined;
    this.items.clear();
    this.groups.length = 0;
    this.query = "";
  },
}));

const keys = vi.hoisted(() => ({
  entries: [] as { keys: string; handler: () => void }[],
  reset() {
    this.entries = [];
  },
  /** What pressing `combo` runs in the shell. */
  press(combo: string) {
    const hit = this.entries.find((e) => e.keys === combo);
    if (!hit) throw new Error(`no ${combo} binding; registered: ${this.entries.map((e) => e.keys).join(", ")}`);
    hit.handler();
  },
}));

const selection = vi.hoisted(() => ({
  selected: null as string | null,
  /** What the page shows; `visibleRowIds()` is the palette's on-screen test. */
  visible: [] as string[],
  reset() {
    this.selected = null;
    this.visible = [];
  },
}));

const actions = vi.hoisted(() => ({
  me: "lennard" as string | null,
  setOwner: 0 as unknown,
  release: 0 as unknown,
}));

/* ------------------------------------------------------------------ mocks */

vi.mock("@/app/ui-store", () => {
  const make = () => {
    let open = false;
    const listeners = new Set<() => void>();
    const set = (v: boolean) => {
      if (v === open) return;
      open = v;
      listeners.forEach((l) => l());
    };
    return {
      set,
      toggle: () => set(!open),
      get: () => open,
      use: () => open,
    };
  };
  const paletteStore = make();
  const shortcutsStore = make();
  return {
    paletteStore,
    shortcutsStore,
    openCommandPalette: () => paletteStore.set(true),
    openShortcuts: () => shortcutsStore.set(true),
  };
});

vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children?: ReactNode }) => {
    rec.open = open;
    rec.onOpenChange = onOpenChange;
    return <div data-slot="palette">{open ? children : null}</div>;
  },
  Command: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => {
    rec.query = value;
    return <input value={value} readOnly onChange={() => onValueChange("")} />;
  },
  CommandList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: { heading?: string; children?: ReactNode }) => {
    if (heading) rec.groups.push(heading);
    return <div>{children}</div>;
  },
  CommandItem: ({ value, onSelect, children }: { value: string; onSelect?: () => void; children?: ReactNode }) => {
    rec.items.set(value, onSelect ?? (() => {}));
    return <button type="button">{children}</button>;
  },
  CommandSeparator: () => null,
  CommandShortcut: () => null,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SidebarInset: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
  useSidebar: () => ({ state: "expanded", isMobile: false, open: true, toggleSidebar: vi.fn() }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/hotkeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hotkeys")>();
  return {
    ...actual,
    useHotkey: (combo: string, handler: () => void) => {
      keys.entries.push({ keys: combo, handler });
    },
    useHotkeyList: () => [],
  };
});

vi.mock("@/components/task/selection", () => ({
  useSelectedId: () => selection.selected,
  visibleRowIds: () => selection.visible,
  rowTask: (id: string | null) => (id ? byId(id) : null),
}));

vi.mock("@/components/task/actions", () => ({
  useTaskActions: () => ({ me: actions.me, setOwner: actions.setOwner, release: actions.release }),
}));

vi.mock("@/lib/hooks", () => ({
  useTasks: () => ({ data: tasks, isLoading: false, error: null }),
  useTask: (id: string | null) => ({ data: id ? byId(id) : null, isLoading: false, error: null }),
  useProjects: () => ({ data: [], isLoading: false, error: null }),
  useProjectCounts: () => null,
  useLabels: () => [],
  useMembers: () => ({ data: members, isLoading: false, error: null }),
  useMemberMap: () => new Map(members.map((m) => [m.id, m])),
  useMe: () => actions.me,
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return {
    ...actual,
    navigate: vi.fn(),
    useRoute: () => ({ name: "today" as const, path: "/today", params: {}, query: new URLSearchParams() }),
    useRouteParams: () => ({}),
    useRouteQuery: () => new URLSearchParams(),
    setRouteQuery: vi.fn(),
  };
});

vi.mock("@/lib/query", () => ({ useVaultEvents: () => {}, runLastUndo: () => {} }));

vi.mock("@/app/routes", () => {
  const names = ["inbox", "today", "upcoming", "agents", "memories", "scratch", "notes", "settings", "search", "project", "label"];
  return {
    ROUTES: Object.fromEntries(
      names.map((n) => [n, { title: n, icon: () => null, hotkey: `g ${n[0]}`, view: () => null }]),
    ),
  };
});

vi.mock("@/app/detail", () => ({ useDetail: () => ({ target: null }), openTask: vi.fn(), closeDetail: vi.fn() }));
vi.mock("@/app/DetailPane", () => ({ DetailPane: () => null }));
vi.mock("@/app/Sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/app/QuickAdd", () => ({ QuickAdd: () => null }));
vi.mock("@/app/ShortcutsDialog", () => ({ ShortcutsDialog: () => null }));
vi.mock("@/components/task/DeleteTaskConfirm", () => ({ DeleteTaskConfirm: () => null }));
vi.mock("@/app/header", () => ({ HEADER_ACTIONS_ID: "header-actions", setHeaderActionsEl: () => {}, useHeaderTitleOverride: () => null }));
vi.mock("@/app/theme", () => ({ useThemeCycle: () => ({ next: "dark", cycle: vi.fn() }) }));
vi.mock("@/app/quickadd-store", () => ({ openQuickAdd: vi.fn(), useQuickAdd: () => false }));

import { paletteStore } from "@/app/ui-store";

/** The shipped store exposes `set`/`toggle`/`use`; the test copy also reads its value directly. */
const palette = paletteStore as typeof paletteStore & { get: () => boolean };
import { CommandPalette } from "./CommandPalette";
import { AppShell } from "./AppShell";
import { openQuickAdd } from "./quickadd-store";

/* ----------------------------------------------------------------- helpers */

const withQuery = (node: ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

/** Render the palette alone and return its item handlers. */
function renderPalette() {
  rec.reset();
  withQuery(<CommandPalette />);
  return rec;
}

/** Render the whole shell (which mounts the palette) and return its recorders. */
function renderShell() {
  rec.reset();
  keys.reset();
  withQuery(<AppShell />);
  return { rec, keys };
}

beforeEach(() => {
  selection.reset();
  actions.me = "lennard";
  actions.setOwner = vi.fn();
  actions.release = vi.fn();
  palette.set(false);
});

/* ------------------------------------------------------------------- tests */

describe("P20 — a palette action runs against the selection", () => {
  it("offers the shell's routes and no task action while nothing is selected", () => {
    palette.set(true);
    const r = renderPalette();
    expect(r.open).toBe(true);
    // It really is the palette's list, not an empty stub: the "Go to" group follows PALETTE_ROUTES.
    expect([...r.items.keys()].filter((k) => k.startsWith("go "))).toEqual([
      "go search",
      "go inbox",
      "go today",
      "go upcoming",
      "go agents",
      "go memories",
      "go scratch",
      "go notes",
      "go settings",
    ]);
    expect([...r.items.keys()].filter((k) => k.startsWith("handoff:") || k.includes("take back"))).toEqual([]);
    expect(actions.setOwner).not.toHaveBeenCalled();
  });

  it("hands the selected row off, then closes and clears itself", () => {
    selection.selected = "t-open";
    selection.visible = ["t-open", "t-neighbour"];
    palette.set(true);
    const r = renderPalette();
    expect(r.groups).toContain("Hand off · Ship the slice");
    // The owner is never offered back to themselves.
    expect([...r.items.keys()].filter((k) => k.startsWith("handoff:"))).toEqual(["handoff:claude", "handoff:codex"]);

    r.items.get("handoff:claude")?.();

    // The action targets the selected task, not the neighbour and not a route.
    expect(actions.setOwner).toHaveBeenCalledTimes(1);
    expect(actions.setOwner).toHaveBeenCalledWith(byId("t-open"), "claude");

    // act → closed, and the search box reset: the next ⌘K starts clean.
    expect(palette.get()).toBe(false);
    expect(renderPalette().open).toBe(false);
    expect(r.query).toBe("");
  });

  it("takes back a delegated row", () => {
    selection.selected = "t-delegated";
    selection.visible = ["t-delegated"];
    palette.set(true);
    const r = renderPalette();
    r.items.get("take back release handoff")?.();
    expect(actions.release).toHaveBeenCalledTimes(1);
    expect(actions.release).toHaveBeenCalledWith(byId("t-delegated"));
    expect(palette.get()).toBe(false);
  });

  it("refuses an action for a selection the page is no longer showing", () => {
    selection.selected = "t-open";
    selection.visible = ["t-neighbour"];
    palette.set(true);
    const r = renderPalette();
    expect(r.groups.some((g) => g.startsWith("Hand off"))).toBe(false);
    expect([...r.items.keys()].filter((k) => k.startsWith("handoff:") || k.includes("take back"))).toEqual([]);
  });

  it("runs the non-task actions through the same close-then-act path", () => {
    palette.set(true);
    const r = renderPalette();
    r.items.get("add task create new")?.();
    expect(openQuickAdd).toHaveBeenCalledTimes(1);
    expect(palette.get()).toBe(false);
    expect(r.query).toBe("");
  });
});

describe("P20 — the open and close path is keyboard-only", () => {
  it("⌘K opens the palette from the shell and a second ⌘K closes it", () => {
    const first = renderShell();
    expect(first.rec.open).toBe(false);
    expect(first.rec.items.size).toBe(0);

    first.keys.press("mod+k");
    expect(palette.get()).toBe(true);

    const open = renderShell();
    expect(open.rec.open).toBe(true);
    expect(open.rec.items.has("add task create new")).toBe(true);

    open.keys.press("mod+k");
    expect(palette.get()).toBe(false);
    expect(renderShell().rec.open).toBe(false);
  });

  it("advertises arrows, Enter and Esc — the palette is driven without the pointer", () => {
    palette.set(true);
    const html = withQuery(<CommandPalette />);
    for (const hint of ["↑", "↓", "↵", "Esc"]) expect(html).toContain(hint);
    expect(html).toContain("navigate");
    expect(html).toContain("open");
    expect(html).toContain("close");
  });
});
