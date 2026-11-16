/**
 * P6 — archive, delete and undo of a project (R35), through the production menu items and dialog.
 *
 * `ProjectMenuItems` (the one item list both menu kits use), `DeleteProjectDialog` and the hooks
 * behind them (`useArchiveProject`, `useDeleteProject`) are the real ones. Only the edges are
 * replaced: the transport (`@/lib/api`), the toast surface, the router and the presentation
 * primitives that need a DOM. Same split as `views/memories/memory-manager.test.tsx`; no hook
 * under test is mocked.
 *
 * Deliberately absent: R35's "to the OS Trash (R25)" clause. The app's delete tools still unlink
 * (D6 as amended moves them to the OS Trash, designed-not-built), so that clause is parity row
 * P23 and asserting it here would make P6's verdict lie.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Task } from "@/lib/types";

/* ---------------------------------------------------------------- fixtures */

const project: Project = {
  id: "n-launch",
  title: "Launch",
  color: "teal",
  sections: ["Plan", "Build"],
  open_count: 2,
};

const other: Project = { id: "n-garden", title: "Garden", color: null, sections: [], open_count: 0 };

/** The raw bytes a project note delete hands back — what Undo must put back verbatim. */
const DELETED = {
  path: "/vault/notes/Launch.md",
  content: "---\ntitle: Launch\ncolor: teal\n---\n\nShip it on the 30th.\n",
};

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  type: "task",
  title: id,
  tags: [],
  owner: null,
  created: null,
  updated: null,
  status: "open",
  priority: null,
  claimed_by: null,
  project: "n-launch",
  blocks: [],
  blocked_by: [],
  ...over,
});

/* --------------------------------------------------------------- recorders */

const rec = vi.hoisted(() => ({
  /** Every transport/undo call, in the order the component made it. */
  order: [] as string[],
  /** `toastWithUndo` calls: message, undo callback, description. */
  undos: [] as { message: string; undo?: () => void; description?: string }[],
  /** Dropdown item label → its onSelect. */
  menu: new Map<string, () => void>(),
  /** The delete dialog's confirm action. */
  confirm: null as (() => void) | null,
  /** Text rendered by the dialog's title and description. */
  texts: [] as string[],
  /** What `taskList` answers with in the current test. */
  open: [] as Task[],
  /** What the router says. */
  route: { name: "project", params: { id: "n-launch" } } as { name: string; params: Record<string, string | undefined> },
  label(children: unknown): string {
    if (children == null || typeof children === "boolean") return "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map((c) => this.label(c)).join(" ");
    const el = children as { props?: { children?: unknown } };
    return el.props ? this.label(el.props.children) : "";
  },
  reset() {
    this.order.length = 0;
    this.undos.length = 0;
    this.menu.clear();
    this.confirm = null;
    this.texts.length = 0;
    this.open = [];
    this.route = { name: "project", params: { id: "n-launch" } };
  },
}));

/* ------------------------------------------------------------------ mocks */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    hostProjectUpdate: vi.fn(async (id: string, set: { archived?: boolean }) => {
      rec.order.push(`hostProjectUpdate:${JSON.stringify(set)}`);
      return { ...project, id, ...set };
    }),
    taskList: vi.fn(async () => {
      rec.order.push("taskList");
      return rec.open;
    }),
    taskUpdate: vi.fn(async (id: string, args: Record<string, unknown>) => {
      rec.order.push(`taskUpdate:${id}:${JSON.stringify(args)}`);
      return { ...task(id), ...args };
    }),
    hostNoteDelete: vi.fn(async (id: string) => {
      rec.order.push(`hostNoteDelete:${id}`);
      return DELETED;
    }),
    hostRestore: vi.fn(async (file: { path: string; content: string }) => {
      rec.order.push(`hostRestore:${file.path}`);
      return { path: file.path };
    }),
  };
});

vi.mock("@/lib/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/query")>();
  return {
    ...actual,
    toastWithUndo: (message: string, undo?: () => void, opts: { description?: string } = {}) => {
      rec.undos.push({ message, undo, description: opts.description });
    },
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() }),
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return { ...actual, navigate: vi.fn(), useRoute: () => rec.route };
});

/** The host probe only gates the disabled state; these are hosts that have the tool. */
vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return { ...actual, useProjectMetaSupported: () => true };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuGroup: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onSelect }: { children?: ReactNode; onSelect?: (e: Event) => void }) => {
    rec.menu.set(rec.label(children).trim(), () => onSelect?.({} as Event));
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => {
    rec.texts.push(rec.label(children));
    return <h2>{children}</h2>;
  },
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => {
    rec.texts.push(rec.label(children));
    return <p>{children}</p>;
  },
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    rec.confirm = () => onClick?.();
    return <button type="button">{children}</button>;
  },
}));

/** Closed dialogs render nothing, so the sibling rename dialog stays inert in this node env. */
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuItem: () => null,
  ContextMenuSeparator: () => null,
  ContextMenuSub: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ContextMenuSubTrigger: () => null,
  ContextMenuSubContent: () => null,
}));

import { hostNoteDelete, hostProjectUpdate, hostRestore, taskList, taskUpdate, type ProjectUpdate } from "@/lib/api";
import { qk } from "@/lib/query";
import { navigate, paths } from "@/lib/router";
import { ProjectDialogs, ProjectMenuItems } from "./ProjectMenu";

/* ----------------------------------------------------------------- helpers */

function render(node: ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** A client whose project rows are warm, so the optimistic archive edit is observable. */
function warmClient() {
  const client = new QueryClient();
  client.setQueryData<Project[]>(qk.host.projects, [project, other]);
  return client;
}

const cachedRows = (client: QueryClient) => client.getQueryData<Project[]>(qk.host.projects) ?? [];
const updates = () => vi.mocked(hostProjectUpdate).mock.calls as [string, ProjectUpdate][];
const moves = () => vi.mocked(taskUpdate).mock.calls as [string, { project: string; section: string }][];

function press(label: string) {
  const hit = rec.menu.get(label);
  if (!hit) throw new Error(`no “${label}” menu item; rendered: ${[...rec.menu.keys()].join(", ")}`);
  hit();
}

function confirmDelete() {
  if (!rec.confirm) throw new Error("the delete dialog rendered no confirm action");
  rec.confirm();
}

function undoFor(prefix: string) {
  const hits = rec.undos.filter((u) => u.message.startsWith(prefix));
  expect(hits, `Undo toasts saying “${prefix}…”`).toHaveLength(1);
  const fn = hits[0].undo;
  if (!fn) throw new Error(`the “${hits[0].message}” toast carries no Undo`);
  return { message: hits[0].message, description: hits[0].description, undo: fn };
}

beforeEach(() => {
  rec.reset();
  vi.mocked(hostProjectUpdate).mockClear();
  vi.mocked(taskList).mockClear();
  vi.mocked(taskUpdate).mockClear();
  vi.mocked(hostNoteDelete).mockClear();
  vi.mocked(hostRestore).mockClear();
  vi.mocked(navigate).mockClear();
});

/* ------------------------------------------------------------------- tests */

describe("P6 — archiving a project", () => {
  it("issues one host_project_update, moves the cached row, and offers one Undo that flips it back", async () => {
    const client = warmClient();
    render(<ProjectMenuItems project={project} kind="dropdown" onDialog={() => {}} />, client);

    press("Archive");

    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toEqual(["n-launch", { archived: true }]);
    // The row the sidebar and the projections read is archived; its neighbour is untouched.
    await vi.waitFor(() => {
      expect(cachedRows(client).map((p) => [p.id, p.archived ?? false])).toEqual([
        ["n-launch", true],
        ["n-garden", false],
      ]);
    });

    const undo = undoFor("Archived");
    expect(undo.message).toBe("Archived “Launch”");
    await undo.undo();
    expect(updates()).toHaveLength(2);
    expect(updates()[1]).toEqual(["n-launch", { archived: false }]);
  });

  it("offers Unarchive on an archived project, and it writes archived:false", async () => {
    render(<ProjectMenuItems project={{ ...project, archived: true }} kind="dropdown" onDialog={() => {}} />, warmClient());

    expect([...rec.menu.keys()]).toContain("Unarchive");
    expect([...rec.menu.keys()]).not.toContain("Archive");
    press("Unarchive");

    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toEqual(["n-launch", { archived: false }]);
    expect(undoFor("Unarchived").message).toBe("Unarchived “Launch”");
  });
});

describe("P6 — deleting a project", () => {
  it("names the open-task count, moves each open task to the Inbox, then deletes the note", async () => {
    rec.open = [
      task("t-plan", { section: "Plan", title: "Draft plan" }),
      task("t-loose", { section: "", title: "Book venue", status: "claimed", claimed_by: "claude" }),
    ];
    render(<ProjectDialogs dialog={{ kind: "delete", project }} onClose={() => {}} />, warmClient());

    // ProjectMenu.tsx:169 — the confirmation names the count before anything is written.
    expect(rec.texts.join(" ")).toContain("Its 2 open tasks move to the Inbox.");

    confirmDelete();

    await vi.waitFor(() => expect(vi.mocked(hostNoteDelete).mock.calls).toEqual([["n-launch"]]));
    // One list for the project's open work, and only open/claimed work.
    expect(vi.mocked(taskList).mock.calls).toEqual([[{ project: "n-launch", status: "open,claimed" }]]);
    // One write per task, taking the project *and* the section off it: the task lands in the Inbox.
    expect(moves()).toEqual([
      ["t-plan", { project: "", section: "" }],
      ["t-loose", { project: "", section: "" }],
    ]);
    // …and only then the note write.
    expect(rec.order).toEqual(["taskList", 'taskUpdate:t-plan:{"project":"","section":""}', 'taskUpdate:t-loose:{"project":"","section":""}', "hostNoteDelete:n-launch"]);

    const toast = undoFor("Deleted project");
    expect(toast.message).toBe("Deleted project “Launch”");
    expect(toast.description).toBe("2 open tasks moved to the Inbox.");
    // The open project view is left behind: it no longer exists.
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.inbox()]]);
  });

  it("says nothing about tasks when the project has none open", async () => {
    rec.open = [];
    render(<ProjectDialogs dialog={{ kind: "delete", project: { ...project, open_count: 0 } }} onClose={() => {}} />, warmClient());

    expect(rec.texts.join(" ")).not.toContain("move to the Inbox");

    confirmDelete();

    await vi.waitFor(() => expect(vi.mocked(hostNoteDelete).mock.calls).toEqual([["n-launch"]]));
    expect(taskList).toHaveBeenCalledTimes(1);
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(undoFor("Deleted project").description).toBeUndefined();
  });

  it("undone, restores the note's exact bytes and puts every moved task back in its section", async () => {
    rec.open = [
      task("t-plan", { section: "Plan" }),
      task("t-loose", { section: "" }),
    ];
    render(<ProjectDialogs dialog={{ kind: "delete", project }} onClose={() => {}} />, warmClient());
    confirmDelete();
    await vi.waitFor(() => expect(rec.undos).toHaveLength(1));

    const undo = undoFor("Deleted project");
    vi.mocked(taskUpdate).mockClear();
    rec.order.length = 0;
    await undo.undo();

    // The bytes the host returned, verbatim — not a re-serialised note.
    expect(vi.mocked(hostRestore).mock.calls).toEqual([[DELETED]]);
    // One write per moved task, back into the project and into the section it came from.
    expect(moves()).toEqual([
      ["t-plan", { project: "n-launch", section: "Plan" }],
      ["t-loose", { project: "n-launch", section: "" }],
    ]);
    expect(rec.order).toEqual(["hostRestore:/vault/notes/Launch.md", 'taskUpdate:t-plan:{"project":"n-launch","section":"Plan"}', 'taskUpdate:t-loose:{"project":"n-launch","section":""}']);
  });
});
