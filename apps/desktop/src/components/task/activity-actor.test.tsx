/**
 * P30 — every Activity row names its actor (desktop-app R12 with the task-model-v2 R19 stamps).
 *
 * `Activity` is mounted on its own, the way `task-row-deadline.test.tsx` mounts `TaskRow`: the
 * real list, the real body parsers and the real `Avatar`. Only the host hooks are stubbed
 * (`useMemberMap`) and the detail singleton, because nothing here navigates.
 *
 * The two rows this file exists for are "Completed" and "Last updated": they read their actor
 * from the task record rather than from a stamped comment, which is why the parity matrix found
 * them bare.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

vi.mock("@/lib/hooks", () => ({
  useMemberMap: () =>
    new Map([
      ["alice", { id: "alice", kind: "human", name: "Alice" }],
      ["claude", { id: "claude", kind: "agent", name: "claude" }],
    ]),
  useMe: () => "alice",
  useTasks: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
}));

vi.mock("@/app/detail", () => ({
  openTask: vi.fn(),
  closeDetail: vi.fn(),
  useDetail: () => ({ isOpen: () => false, target: null }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { parseTerminalStamp } from "./model";
import { Activity } from "./TaskDetail";

/** Days ago, RFC 3339 — the rows print relative time, so the fixtures ride the clock. */
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    type: "task",
    title: "Ship the release",
    tags: [],
    owner: "alice",
    created: "2026-11-01T00:00:00Z",
    updated: ago(2),
    status: "done",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

const html = (t: Task) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Activity task={t} />
      </TooltipProvider>
    </QueryClientProvider>,
  );

/** The `<li>` whose label starts with `label`, as plain text ("Completed · Alice 2d ago"). */
function rowText(markup: string, label: string): string {
  const at = markup.indexOf(`>${label}`);
  expect(at).toBeGreaterThan(-1);
  const li = markup.slice(markup.lastIndexOf("<li", at), markup.indexOf("</li>", at));
  return li.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

describe("activity rows name their actor (P30)", () => {
  it("names the finisher on Completed and the last writer on Last updated", () => {
    const done = ago(2);
    const markup = html(
      task({
        updated: done,
        completed: done,
        updated_by: "alice",
        body: `Body.\n\n## Outcome\n\n${done} — claude\nShipped.`,
      }),
    );
    expect(rowText(markup, "Completed")).toContain("Completed · claude");
    expect(rowText(markup, "Last updated")).toContain("Last updated · Alice");
  });

  it("keeps the finisher on Completed after a later write moved the stamp", () => {
    const done = ago(4);
    const markup = html(
      task({
        updated: ago(1),
        completed: done,
        updated_by: "alice",
        body: `Body.\n\n## Outcome\n\n${done} — claude\nShipped.`,
      }),
    );
    expect(rowText(markup, "Completed")).toContain("Completed · claude");
    expect(rowText(markup, "Last updated")).toContain("Last updated · Alice");
  });

  it("names nobody when the vault carries no stamp (v1 file)", () => {
    const done = ago(2);
    const markup = html(task({ updated: done, completed: done }));
    expect(rowText(markup, "Completed")).not.toContain("·");
    expect(rowText(markup, "Last updated")).not.toContain("·");
  });

  it("falls back to updated_by for a recurring finish, which appends no section", () => {
    const done = ago(2);
    const markup = html(task({ status: "open", updated: done, completed: done, updated_by: "claude" }));
    expect(rowText(markup, "Completed")).toContain("Completed · claude");
  });
});

describe("parseTerminalStamp", () => {
  const at = "2026-11-20T10:00:00Z";

  it("reads the stamp of a finish that carried no note", () => {
    expect(parseTerminalStamp(`## Outcome\n\n${at} — alice`)).toEqual({ at, actor: "alice" });
  });

  it("reads a stamp written above an existing Comments section", () => {
    const body = `## Outcome\n\n${at} — claude\n\n## Comments\n\n2026-11-21T09:00:00Z — alice\nHi`;
    expect(parseTerminalStamp(body)?.actor).toBe("claude");
  });

  it("is null when the file has no terminal section, and bare when the stamp has no actor", () => {
    expect(parseTerminalStamp("Body only.")).toBeNull();
    expect(parseTerminalStamp(`## Outcome\n\n${at}`)).toEqual({ at, actor: null });
  });

  it("reads the second stamp of a reopened task, not the first finish", () => {
    const again = "2026-11-24T08:00:00Z";
    const body = `## Outcome\n\n${at} — claude\nShipped.\n\n## Comments\n\n2026-11-21T09:00:00Z — alice\nReopening this.\n\n## Outcome\n\n${again} — alice\nDone for real.`;
    expect(parseTerminalStamp(body)).toEqual({ at: again, actor: "alice" });
  });
});
