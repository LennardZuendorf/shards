/**
 * P31 — the memory manager's flows (R18 recall playground, R19 forget), not its helpers.
 *
 * Real `MemoriesView` (list, facet filters from the route query, hidden-count affordances, the
 * recall tab) and real `MemoryDetail` (forget → `host_memory_forget` → Undo → `host_restore`), both
 * rendered with `renderToStaticMarkup`; the host, the router and the presentation primitives that
 * would need a DOM are recorded instead (see `app/palette-selection.test.tsx` for the same pattern).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "@/lib/types";

/* ---------------------------------------------------------------- fixtures */

/** `now`-relative so the expiry state does not depend on the wall clock. */
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const memories: Memory[] = [
  {
    id: "m-live",
    title: "Deploy runs from main",
    kind: "fact",
    scope: "shared",
    owner: "lennard",
    project: null,
    importance: 5,
    source: "standup",
    expires: null,
    superseded_by: null,
    tags: ["deploy"],
    created: iso(-10),
    updated: iso(-9),
    body: "Deploys go out from main only.",
  },
  {
    id: "m-expired",
    title: "Old release checklist",
    kind: "procedure",
    scope: "shared",
    owner: "lennard",
    project: null,
    importance: 3,
    source: null,
    expires: iso(-2),
    superseded_by: null,
    tags: [],
    created: iso(-40),
    updated: iso(-30),
    body: "Superseded by the CI pipeline.",
  },
  {
    id: "m-superseded",
    title: "Deploy runs from a branch",
    kind: "fact",
    scope: "shared",
    owner: "claude",
    project: null,
    importance: 2,
    source: null,
    expires: null,
    superseded_by: "m-live",
    tags: ["deploy"],
    created: iso(-60),
    updated: iso(-50),
    body: "Corrected on 2026-11-01.",
  },
].map((m) => ({ type: "memory", ...m })) as Memory[];

const memoryById = (id: string) => memories.find((m) => m.id === id) ?? null;

const route = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  query: "",
  reset(id?: string, query = "") {
    this.params = id ? { id } : {};
    this.query = query;
  },
}));

/* --------------------------------------------------------------- recorders */

const ui = vi.hoisted(() => ({
  /** Menu item label → onSelect, in document order. */
  menu: new Map<string, () => void>(),
  /** Props each list row received. */
  rows: [] as { id: string; successor?: Memory; onSelect: () => void }[],
  /** The recall playground's props. */
  recall: null as { all: Memory[] } | null,
  /** Captured Undo callbacks from `toastWithUndo`. */
  undos: [] as { message: string; undo?: () => void }[],
  keys: [] as { keys: string; handler: () => void }[],
  /** Flatten element children to their text. */
  label(children: unknown): string {
    if (children == null || typeof children === "boolean") return "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map((c) => this.label(c)).join(" ");
    const el = children as { props?: { children?: unknown } };
    return el.props ? this.label(el.props.children) : "";
  },
  reset() {
    this.menu.clear();
    this.rows.length = 0;
    this.recall = null;
    this.undos.length = 0;
    this.keys = [];
  },
  press(combo: string) {
    const hit = this.keys.find((k) => k.keys === combo);
    if (!hit) throw new Error(`no ${combo} binding; registered: ${this.keys.map((k) => k.keys).join(", ")}`);
    hit.handler();
  },
}));

/* ------------------------------------------------------------------ mocks */

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return {
    ...actual,
    navigate: vi.fn(),
    useRouteParams: () => route.params,
    useRouteQuery: () => new URLSearchParams(route.query),
    setRouteQuery: vi.fn(),
  };
});

vi.mock("@/components/memory/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/memory/hooks")>();
  return {
    ...actual,
    useAllMemories: () => ({ data: memories, isLoading: false, error: null }),
    useMemory: (id: string | null) => ({ data: id ? memoryById(id) : null, isLoading: false, error: null }),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    hostMemoryForget: vi.fn(async (id: string) => ({ path: `/vault/memories/${id}.md`, content: `# ${id}\n` })),
    hostRestore: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/query")>();
  return {
    ...actual,
    toastWithUndo: (message: string, undo?: () => void) => {
      ui.undos.push({ message, undo });
    },
  };
});

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));

vi.mock("@/lib/hotkeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hotkeys")>();
  return {
    ...actual,
    useHotkey: (combo: string, handler: () => void) => {
      ui.keys.push({ keys: combo, handler });
    },
  };
});

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    useProjects: () => ({ data: [], isLoading: false, error: null }),
    useMembers: () => ({ data: [], isLoading: false }),
    useMemberMap: () => new Map(),
  };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuShortcut: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuGroup: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuRadioGroup: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuRadioItem: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuItem: ({ children, onSelect }: { children?: ReactNode; onSelect?: () => void }) => {
    ui.menu.set(ui.label(children).trim(), onSelect ?? (() => {}));
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/app/header", () => ({
  HeaderActions: ({ children }: { children?: ReactNode }) => <>{children}</>,
  HEADER_ACTIONS_ID: "header-actions",
  setHeaderActionsEl: () => {},
  useHeaderTitleOverride: () => null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/switch", () => ({ Switch: () => null }));

vi.mock("@/components/memory/MemoryRow", () => ({
  MemoryRow: ({ memory, successor, onSelect }: { memory: Memory; successor?: Memory; onSelect: () => void }) => {
    ui.rows.push({ id: memory.id, successor, onSelect });
    return <button type="button">{memory.title}</button>;
  },
}));

vi.mock("@/components/memory/RecallPlayground", () => ({
  RecallPlayground: ({ all }: { all: Memory[] }) => {
    ui.recall = { all };
    return <div>playground</div>;
  },
}));

vi.mock("@/components/memory/MemoryLinks", () => ({ MemoryLinks: () => null }));
vi.mock("@/components/memory/MemoryDialog", () => ({ MemoryDialog: () => null }));
vi.mock("@/components/note/Markdown", () => ({ Markdown: () => null }));
vi.mock("@/components/note/TagEditor", () => ({ TagEditor: () => null }));

import { qk } from "@/lib/query";
import { ALL_MEMORIES_ARGS } from "@/components/memory/hooks";
import { hostMemoryForget, hostRestore } from "@/lib/api";
import { navigate, paths } from "@/lib/router";
import { MemoriesView } from "./MemoriesView";

/* ----------------------------------------------------------------- helpers */

function render(client = new QueryClient()) {
  ui.reset();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoriesView />
    </QueryClientProvider>,
  );
  return html;
}

/** A client whose memory list is warm, so optimistic cache edits are observable. */
function warmClient() {
  const client = new QueryClient();
  client.setQueryData(qk.memories.list(ALL_MEMORIES_ARGS), memories);
  return client;
}

beforeEach(() => {
  route.reset();
  vi.mocked(hostMemoryForget).mockClear();
  vi.mocked(hostRestore).mockClear();
  vi.mocked(navigate).mockClear();
});

/* ------------------------------------------------------------------- tests */

describe("P31 — the memory manager lists what recall would return", () => {
  it("hides expired and superseded memories, and says how many it hid", () => {
    const html = render();
    expect(ui.rows.map((r) => r.id)).toEqual(["m-live"]);
    expect(html).toContain("Show 1 expired");
    expect(html).toContain("Show 1 superseded");
  });

  it("narrows to the facets held in the route query", () => {
    route.reset(undefined, "kind=procedure&expired=1");
    const html = render();
    expect(ui.rows.map((r) => r.id)).toEqual(["m-expired"]);
    // An active filter makes the count say what it is filtering out of.
    expect(html).toContain("of 3");
  });

  it("shows everything when the route asks for expired and superseded", () => {
    route.reset(undefined, "expired=1&superseded=1");
    const html = render();
    expect(ui.rows.map((r) => r.id)).toEqual(["m-live", "m-expired", "m-superseded"]);
    expect(html).not.toContain("Show 1 expired");
    expect(html).not.toContain("Show 1 superseded");
  });

  it("opens a list row by id", () => {
    render();
    ui.rows[0].onSelect();
    expect(navigate).toHaveBeenCalledWith(paths.memories("m-live"), { replace: false });
  });

  it("renders the recall playground over every memory, expired included", () => {
    route.reset(undefined, "tab=recall");
    const html = render();
    expect(html).toContain("playground");
    expect(ui.recall?.all.map((m) => m.id)).toEqual(["m-live", "m-expired", "m-superseded"]);
    expect(ui.rows).toEqual([]);
  });
});

describe("P31 — the memory manager's forget path", () => {
  it("forgets the open memory, drops it from the list, and Undo restores its bytes", async () => {
    route.reset("m-live");
    const client = warmClient();
    render(client);

    ui.menu.get("Forget")?.();

    await vi.waitFor(() => expect(hostMemoryForget).toHaveBeenCalledWith("m-live"));
    // The manager's list no longer offers it…
    await vi.waitFor(() => {
      const list = client.getQueryData<Memory[]>(qk.memories.list(ALL_MEMORIES_ARGS));
      expect(list?.map((m) => m.id)).toEqual(["m-expired", "m-superseded"]);
    });
    // …and the pane closes back to the list.
    expect(navigate).toHaveBeenCalledWith(paths.memories(), { replace: false });

    // Exactly one Undo, wired to the raw bytes the host returned.
    const undo = ui.undos.find((u) => u.message.startsWith("Forgot"));
    expect(ui.undos.filter((u) => u.message.startsWith("Forgot"))).toHaveLength(1);
    expect(undo?.message).toContain("Deploy runs from main");
    undo?.undo?.();
    await vi.waitFor(() =>
      expect(hostRestore).toHaveBeenCalledWith({ path: "/vault/memories/m-live.md", content: "# m-live\n" }),
    );
  });

  it("forgets from the keyboard (⌘⌫), the same path the menu takes", async () => {
    route.reset("m-live");
    render(warmClient());
    ui.press("mod+backspace");
    await vi.waitFor(() => expect(hostMemoryForget).toHaveBeenCalledWith("m-live"));
  });

  it("does not offer forget without an open memory", () => {
    render(warmClient());
    expect(ui.menu.has("Forget")).toBe(false);
    expect(ui.keys.some((k) => k.keys === "mod+backspace")).toBe(false);
  });
});
