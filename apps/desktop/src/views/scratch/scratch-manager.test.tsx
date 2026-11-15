/**
 * P31 — the scratch manager's flows (R20 view/edit/append, R21 clear+undo), not its helpers.
 *
 * Real `ScratchViewer` (and the real `ScratchView` that mounts it for `/scratch/:agent/:name`),
 * rendered with `renderToStaticMarkup`. Three things stand in for the browser:
 *
 * - the draft store (`createDetailDraftStore`, the production state container `DetailPane` provides)
 *   is real, so a test drives the editor the way the app does — it writes the same keys the view
 *   reads (`scratch-editing`, `scratch-note`, `scratch-raw`) instead of faking state;
 * - `@/lib/api` is a recording transport; the mutation hooks, the `expectUpdated` precondition and
 *   the conflict error are the shipped ones;
 * - the presentation primitives that need a DOM (radix menus/dialogs, Markdown) are recorded so the
 *   handler a click would run can be invoked.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDetailDraftStore, DraftContext } from "@/app/detail-draft-state";
import type { Scratch } from "@/lib/types";

/* ---------------------------------------------------------------- fixtures */

const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const pad = (over: Partial<Scratch> = {}): Scratch => ({
  type: "scratch",
  name: "plan",
  agent: "claude-code",
  tags: [],
  created: at(-2),
  updated: at(-0.01),
  path: "/vault/scratch/claude-code/plan.md",
  body: "# Plan\n- [ ] first step\n- [x] second step\n",
  ...over,
});

const route = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  reset(agent?: string, name?: string) {
    this.params = { agent, name };
  },
}));

/* --------------------------------------------------------------- recorders */

const ui = vi.hoisted(() => ({
  buttons: new Map<string, () => void>(),
  menu: new Map<string, () => void>(),
  dialogs: new Map<string, () => void>(),
  markdown: null as { body: string; onToggleTask?: (line: number) => void } | null,
  undos: [] as { message: string; undo?: () => void }[],
  keys: [] as { keys: string; handler: () => void }[],
  viewer: null as { agent: string; name: string } | null,
  /** Flatten element children to their text, for labelling a control. */
  label(children: unknown): string {
    if (children == null || typeof children === "boolean") return "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map((c) => this.label(c)).join(" ");
    const el = children as { props?: { children?: unknown } };
    return el.props ? this.label(el.props.children) : "";
  },
  reset() {
    this.buttons.clear();
    this.menu.clear();
    this.dialogs.clear();
    this.markdown = null;
    this.undos.length = 0;
    this.keys = [];
    this.viewer = null;
  },
  press(combo: string) {
    const hit = this.keys.find((k) => k.keys === combo);
    if (!hit) throw new Error(`no ${combo} binding; registered: ${this.keys.map((k) => k.keys).join(", ")}`);
    hit.handler();
  },
}));

const transport = vi.hoisted(() => ({
  /** What `shards_scratch_get` answers — the view's `updated` precondition reads it. */
  latest: null as Scratch | null,
}));

/* ------------------------------------------------------------------ mocks */

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return {
    ...actual,
    navigate: vi.fn(),
    useRouteParams: () => route.params,
    useRouteQuery: () => new URLSearchParams(),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    scratchGet: vi.fn(async () => transport.latest),
    scratchSet: vi.fn(async (name: string, body: string) => pad({ name, body })),
    scratchAppend: vi.fn(async (name: string, text: string) => pad({ name, body: `${text}\n` })),
    hostScratchClear: vi.fn(async () => ({ path: "/vault/scratch/claude-code/plan.md", content: "# Plan\n" })),
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
    useMembers: () => ({ data: [], isLoading: false }),
    useMemberMap: () => new Map(),
  };
});

vi.mock("@/components/scratch/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/scratch/hooks")>();
  return {
    ...actual,
    useScratch: (agent: string | null, name: string | null) => ({
      data: agent && name ? transport.latest : undefined,
      isLoading: false,
      error: null,
    }),
    useScratchList: () => ({ data: [pad()], isLoading: false, error: null }),
    useScratchBodies: () => new Map([["claude-code/plan", pad()]]),
  };
});

vi.mock("@/components/ui/button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  return {
    ...actual,
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
      const label = ui.label(children).trim().replace(/\s+/g, " ");
      if (onClick) ui.buttons.set(label, onClick);
      return <button type="button">{children}</button>;
    },
  };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({ children, onSelect }: { children?: ReactNode; onSelect?: () => void }) => {
    ui.menu.set(ui.label(children).trim().replace(/\s+/g, " "), onSelect ?? (() => {}));
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) => <>{open ? children : null}</>,
  AlertDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    const label = ui.label(children).trim();
    if (onClick) ui.dialogs.set(label, onClick);
    return <button type="button">{children}</button>;
  },
  AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    const label = ui.label(children).trim();
    if (onClick) ui.dialogs.set(label, onClick);
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/components/ui/checkbox", () => ({ Checkbox: () => null }));

/**
 * `useDetailDraftState` reads its store through `useSyncExternalStore`, whose *server snapshot* is
 * the initial value — so a server render can never see a store written before it. This shim keeps
 * the production context store and the view's keys, and reads the store synchronously instead.
 */
vi.mock("@/app/detail-draft-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/detail-draft-state")>();
  const React = await import("react");
  return {
    ...actual,
    useDetailDraftState: <T,>(key: string, initial: T) => {
      const store = React.useContext(actual.DraftContext);
      const fallback = React.useState(initial);
      const value = store ? store.read(key, initial) : fallback[0];
      return [value, (next: T | ((prev: T) => T)) => (store ? store.write(key, next) : fallback[1](next))] as const;
    },
  };
});

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/note/Markdown", () => ({
  Markdown: ({ children, onToggleTask }: { children: string; onToggleTask?: (line: number) => void }) => {
    ui.markdown = { body: children, onToggleTask };
    return <div>rendered</div>;
  },
}));

vi.mock("@/components/memory/MemoryDialog", () => ({ MemoryDialog: () => null }));

import { navigate, paths } from "@/lib/router";
import { hostRestore, hostScratchClear, scratchAppend, scratchGet, scratchSet } from "@/lib/api";
import { ScratchViewer } from "@/components/scratch/ScratchViewer";

/* ----------------------------------------------------------------- helpers */

function render(node: ReactNode, store = createDetailDraftStore()) {
  ui.reset();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DraftContext.Provider value={store}>{node}</DraftContext.Provider>
    </QueryClientProvider>,
  );
  return { html, store };
}

/** Render the viewer for `claude-code/plan` — the pad `transport.latest` describes. */
function renderViewer(store = createDetailDraftStore()) {
  const out = render(<ScratchViewer agent="claude-code" name="plan" onClose={() => navigate(paths.scratch())} />, store);
  return { ...out, store };
}

beforeEach(() => {
  route.reset("claude-code", "plan");
  transport.latest = pad();
  for (const fn of [scratchGet, scratchSet, scratchAppend, hostScratchClear, hostRestore]) vi.mocked(fn).mockClear();
  vi.mocked(navigate).mockClear();
});

/* ------------------------------------------------------------------- tests */

describe("P31 — the scratch manager views a pad", () => {
  it("renders the agent's body, the checklist progress and the live state", () => {
    const { html } = renderViewer();
    expect(ui.markdown?.body).toBe("# Plan\n- [ ] first step\n- [x] second step\n");
    expect(html).toContain("claude-code /");
    expect(html).toContain("1/2 done");
    expect(html).toContain("Leave a note");
  });

  it("shows the raw file when the raw toggle is on", () => {
    const store = createDetailDraftStore();
    store.write("scratch-raw", true);
    const { html } = renderViewer(store);
    expect(html).toContain("<pre");
    expect(html).toContain("# Plan");
    expect(ui.markdown).toBeNull();
  });

  it("ticks a checklist line by writing the whole body back at the version it read", async () => {
    renderViewer();
    ui.markdown?.onToggleTask?.(1);
    await vi.waitFor(() => expect(scratchSet).toHaveBeenCalled());
    expect(scratchSet).toHaveBeenCalledWith("plan", "# Plan\n- [x] first step\n- [x] second step\n", "claude-code");
    // The precondition read is the same file the view rendered.
    expect(scratchGet).toHaveBeenCalledWith("plan", "claude-code");
  });
});

describe("P31 — the scratch manager edits a pad", () => {
  it("saves the draft over the body, at the version the editor opened", async () => {
    const store = createDetailDraftStore();
    store.write("scratch-editing", { draft: "# Plan\nrewritten\n", base: transport.latest?.updated ?? null });
    const { html } = renderViewer(store);
    expect(html).toContain("Saving replaces the whole body");

    ui.buttons.get("Save")?.();
    await vi.waitFor(() => expect(scratchSet).toHaveBeenCalled());
    expect(scratchSet).toHaveBeenCalledWith("plan", "# Plan\nrewritten\n", "claude-code");
    expect(scratchGet).toHaveBeenCalledWith("plan", "claude-code");
  });

  it("refuses to overwrite a body the agent changed underneath, then writes on confirmation", async () => {
    const opened = transport.latest?.updated;
    const store = createDetailDraftStore();
    store.write("scratch-editing", { draft: "# Plan\nrewritten\n", base: opened ?? null });
    renderViewer(store);

    // The agent wrote in between: the file the precondition re-reads is newer.
    transport.latest = pad({ updated: at(0) });
    ui.buttons.get("Save")?.();

    await vi.waitFor(() => expect(store.read("scratch-conflict", null)).toBeTruthy());
    expect(scratchSet).not.toHaveBeenCalled();
    expect(store.read<Scratch | null>("scratch-conflict", null)?.updated).toBe(transport.latest.updated);

    // The dialog asks before replacing: it renders on the next paint, and "Overwrite anyway" writes.
    const after = renderViewer(store);
    expect(after.html).toContain("wrote to this file since you started editing");
    ui.dialogs.get("Overwrite anyway")?.();
    await vi.waitFor(() => expect(scratchSet).toHaveBeenCalled());
    expect(scratchSet).toHaveBeenCalledWith("plan", "# Plan\nrewritten\n", "claude-code");
  });
});

describe("P31 — the scratch manager appends and clears", () => {
  it("appends a note for the agent, timestamped by default", async () => {
    const store = createDetailDraftStore();
    store.write("scratch-note", "please re-read step 3");
    const { html } = renderViewer(store);
    expect(html).toContain("please re-read step 3");

    ui.buttons.get("Append")?.();
    await vi.waitFor(() => expect(scratchAppend).toHaveBeenCalled());
    expect(scratchAppend).toHaveBeenCalledWith("plan", "please re-read step 3", { agent: "claude-code", timestamp: true });
  });

  it("clears the pad, closes the pane and Undo puts the bytes back", async () => {
    renderViewer();
    ui.menu.get("Clear scratchpad")?.();

    await vi.waitFor(() => expect(hostScratchClear).toHaveBeenCalledWith("plan", "claude-code"));
    expect(navigate).toHaveBeenCalledWith(paths.scratch());

    const undo = ui.undos.find((u) => u.message.startsWith("Cleared"));
    expect(undo?.message).toContain("claude-code/plan");
    undo?.undo?.();
    await vi.waitFor(() =>
      expect(hostRestore).toHaveBeenCalledWith({ path: "/vault/scratch/claude-code/plan.md", content: "# Plan\n" }),
    );
  });
});
