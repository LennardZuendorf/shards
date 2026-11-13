/**
 * P31 — `ScratchView` is the manager's board: it groups pads by agent and hands the selected one to
 * the viewer. Rendered with `renderToStaticMarkup`; the viewer and the cards are recorded so the
 * board's own grouping/selection is what is asserted (the viewer's flows live in
 * `scratch-manager.test.tsx`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scratch } from "@/lib/types";

const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const pads: Scratch[] = [
  { type: "scratch", name: "plan", agent: "claude-code", tags: [], created: at(-2), updated: at(-0.01), body: "# Plan\n" },
  { type: "scratch", name: "notes", agent: "claude-code", tags: [], created: at(-3), updated: at(-1), body: "notes\n" },
  { type: "scratch", name: "scratchpad", agent: "codex", tags: [], created: at(-4), updated: at(-2), body: "x\n" },
];

const route = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  reset(agent?: string, name?: string) {
    this.params = { agent, name };
  },
}));

const ui = vi.hoisted(() => ({
  cards: [] as { agent: string; name: string; selected: boolean }[],
  viewer: null as { agent: string; name: string } | null,
  reset() {
    this.cards.length = 0;
    this.viewer = null;
  },
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return { ...actual, navigate: vi.fn(), useRouteParams: () => route.params };
});

vi.mock("@/components/scratch/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/scratch/hooks")>();
  return {
    ...actual,
    useScratchList: () => ({ data: pads, isLoading: false, error: null }),
    useScratchBodies: () => new Map(pads.map((p) => [`${p.agent}/${p.name}`, p])),
  };
});

vi.mock("@/components/scratch/ScratchViewer", () => ({
  ScratchViewer: ({ agent, name }: { agent: string; name: string }) => {
    ui.viewer = { agent, name };
    return <div>viewer</div>;
  },
}));

vi.mock("@/components/scratch/ScratchCard", () => ({
  ScratchCard: ({ item, selected }: { item: Scratch; selected: boolean }) => {
    ui.cards.push({ agent: item.agent, name: item.name, selected });
    return <button type="button">{item.name}</button>;
  },
}));

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    useMembers: () => ({ data: [], isLoading: false }),
    useMemberMap: () => new Map([["claude-code", { id: "claude-code", name: "Claude Code", kind: "agent" }]]),
  };
});

vi.mock("@/lib/hotkeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hotkeys")>();
  return { ...actual, useHotkey: () => {} };
});

vi.mock("@/app/header", () => ({
  HeaderActions: ({ children }: { children?: ReactNode }) => <>{children}</>,
  HEADER_ACTIONS_ID: "header-actions",
  setHeaderActionsEl: () => {},
  useHeaderTitleOverride: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/switch", () => ({ Switch: () => null }));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import { ScratchView } from "./ScratchView";

function render() {
  ui.reset();
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ScratchView />
    </QueryClientProvider>,
  );
}

beforeEach(() => route.reset());

/** `ScratchView`'s `useWide` reads `window.matchMedia` during the first render; hand it one. */
beforeAll(() => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("P31 — the scratch board groups pads by agent and opens one", () => {
  it("lists every pad under its agent, with the file and agent counts", () => {
    const html = render();
    expect(ui.cards.map((c) => `${c.agent}/${c.name}`)).toEqual(["claude-code/plan", "claude-code/notes", "codex/scratchpad"]);
    expect(html).toContain("3 files");
    expect(html).toContain("2 agents");
    expect(html).toContain("Claude Code");
    expect(ui.viewer).toBeNull();
  });

  it("hands /scratch/:agent/:name to the viewer and marks that card selected", () => {
    route.reset("claude-code", "notes");
    const html = render();
    expect(ui.viewer).toEqual({ agent: "claude-code", name: "notes" });
    expect(html).toContain("viewer");
    expect(ui.cards.filter((c) => c.selected).map((c) => c.name)).toEqual(["notes"]);
  });
});
