/**
 * P21 — multi-select bulk actions and their **one** undo (parity row P21).
 *
 * `bulk.ts` builds every batch out of the same pieces: resolve the selection, patch each row,
 * then raise a single Undo toast whose callback inverts the whole batch. This file drives the
 * real hook through `renderToStaticMarkup` (the harness has no DOM: every existing task test
 * asserts pure helpers) and replaces only the modules that are *not* under test —
 * `@/lib/api` (the host calls), `sonner` (the toast surface it hands the undo to) and
 * `./selection` (the store that decides which rows are selected).
 *
 * So the assertions cover the delivered semantics, not a copy of them:
 *   - one host call per row, and rows already carrying the value skipped;
 *   - exactly one undo toast per batch, and invoking it issues the per-row inverse write;
 *   - the batch then collapses the selection.
 */
import { MutationObserver, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

/**
 * No component mounts in this harness (there is no DOM), so `useMutation`'s subscription effect
 * never runs and react-query drops the per-call `onSuccess` a `mutate(vars, { onSuccess })` passes
 * (`mutationObserver.ts`: `if (mutateOptions && this.hasListeners())`). A batch's Undo toast is
 * raised from exactly that callback, so the test stands in for the missing mount by reporting the
 * observer as subscribed; every callback body then runs as it does in the app.
 */
const SubscribableProto = Object.getPrototypeOf(MutationObserver.prototype) as { hasListeners(): boolean };
vi.spyOn(SubscribableProto, "hasListeners").mockReturnValue(true);

const h = vi.hoisted(() => ({
  taskUpdate: vi.fn(),
  taskFinish: vi.fn(),
  taskReopen: vi.fn(),
  hostTaskDelete: vi.fn(),
  hostRestore: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastLoading: vi.fn(),
  selection: { ids: [] as string[], rows: new Map<string, Task>(), cleared: 0 },
}));

vi.mock("sonner", () => {
  const toast = Object.assign(h.toast, {
    success: h.toastSuccess,
    error: h.toastError,
    message: h.toast,
    info: h.toast,
    warning: h.toast,
    loading: h.toastLoading,
    dismiss: vi.fn(),
    custom: vi.fn(),
    promise: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    taskUpdate: h.taskUpdate,
    taskFinish: h.taskFinish,
    taskReopen: h.taskReopen,
    hostTaskDelete: h.hostTaskDelete,
    hostRestore: h.hostRestore,
  };
});

vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    // The selection store is exercised by selection.test.ts; here it only has to say which
    // rows the user picked.
    multiIds: () => [...h.selection.ids],
    rowTask: (id: string | null) => (id ? (h.selection.rows.get(id) ?? null) : null),
    clearMulti: () => {
      h.selection.cleared += 1;
      h.selection.ids = [];
      h.selection.rows.clear();
    },
  };
});

import { useBulkActions } from "./bulk";

type BulkActions = ReturnType<typeof useBulkActions>;

/** The hook can only be called during a render; every test keeps the returned closures. */
const captured: { actions: BulkActions | null } = { actions: null };
let bulk!: BulkActions;

function Probe() {
  captured.actions = useBulkActions();
  return null;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  bulk = captured.actions as BulkActions;
}

/** Select `tasks` as the visible multi-selection. */
function select(...tasks: Task[]) {
  h.selection.ids = tasks.map((t) => t.id);
  h.selection.rows = new Map(tasks.map((t) => [t.id, t]));
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: "lennard",
    created: "2026-11-01T00:00:00Z",
    updated: "2026-11-01T00:00:00Z",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

/** The newest Undo toast: its message and the callback the Undo button runs. */
async function undoToast(): Promise<{ message: string; undo: () => void }> {
  await vi.waitFor(() => expect(h.toast).toHaveBeenCalled());
  const call = h.toast.mock.calls.at(-1) ?? [];
  const opts = call[1] as { action?: { label: string; onClick: () => void } } | undefined;
  expect(opts?.action?.label).toBe("Undo");
  return { message: String(call[0]), undo: () => opts?.action?.onClick() };
}

/** Run a batch, hand back its one Undo, then press it and wait for the writes it issues. */
async function runBatch(run: () => void, written: typeof h.taskUpdate, expected: unknown[][]) {
  run();
  const toast = await undoToast();
  written.mockClear();
  toast.undo();
  await vi.waitFor(() => expect(written.mock.calls).toEqual(expected));
  return toast;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.selection.ids = [];
  h.selection.rows = new Map();
  h.selection.cleared = 0;
  h.hostTaskDelete.mockImplementation(async (id: string) => ({ path: `tasks/${id}.md`, content: `# ${id}` }));
  h.taskFinish.mockResolvedValue({});
  h.taskReopen.mockResolvedValue({});
  h.taskUpdate.mockResolvedValue({});
  h.hostRestore.mockResolvedValue({ path: "" });
  mount();
});

describe("bulk priority (P21)", () => {
  it("patches only the rows that do not have the value, and one undo restores each row's own priority", async () => {
    const a = task("t-a", { priority: "normal" });
    const b = task("t-b", { priority: "high" });
    const c = task("t-c", { priority: "low" });
    select(a, b, c);

    const toast = await runBatch(
      () => bulk.setPriority("high"),
      h.taskUpdate,
      [
        ["t-a", { priority: "normal" }],
        ["t-c", { priority: "low" }],
      ],
    );

    expect(toast.message).toBe("Set priority on 2 tasks");
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.selection.cleared).toBe(1);
  });
});

describe("bulk complete (P21)", () => {
  it("finishes every open row in the batch, and one undo reopens them all", async () => {
    const a = task("t-a");
    const b = task("t-b", { status: "claimed", claimed_by: "claude" });
    const done = task("t-c", { status: "done", completed: "2026-11-10T09:00:00Z" });
    select(a, b, done);

    bulk.complete();
    const toast = await undoToast();
    expect(toast.message).toBe("Completed 2 tasks");
    expect(h.taskFinish.mock.calls).toEqual([["t-a"], ["t-b"]]);
    expect(h.toast).toHaveBeenCalledTimes(1);

    h.taskReopen.mockClear();
    toast.undo();
    await vi.waitFor(() => expect(h.taskReopen.mock.calls).toEqual([["t-a"], ["t-b"]]));
  });

  it("restores a recurring row's schedule instead of reopening it", async () => {
    const r = task("t-r", { recur: "FREQ=WEEKLY", due: "2026-11-14", deadline: "2026-11-20" });
    select(r);

    const toast = await runBatch(
      () => bulk.complete(),
      h.taskUpdate,
      [["t-r", { status: "open", due: "2026-11-14", deadline: "2026-11-20" }]],
    );
    expect(toast.message).toBe("Completed 1 task");
    expect(h.taskFinish.mock.calls).toEqual([["t-r"]]);
    expect(h.taskReopen).not.toHaveBeenCalled();
  });
});

describe("bulk schedule (P21)", () => {
  it("sets one date on the batch and one undo puts each row's own date back", async () => {
    const a = task("t-a");
    const b = task("t-b", { due: "2026-11-20" });
    const c = task("t-c", { due: "2026-11-01" });
    select(a, b, c);

    const toast = await runBatch(
      () => bulk.schedule("2026-11-20"),
      h.taskUpdate,
      [
        ["t-a", { due: "" }],
        ["t-c", { due: "2026-11-01" }],
      ],
    );
    expect(toast.message).toBe("Scheduled 2 tasks");
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it("clears the date on every dated row, and one undo restores each date", async () => {
    const a = task("t-a");
    const b = task("t-b", { due: "2026-11-20" });
    select(a, b);

    const toast = await runBatch(
      () => bulk.schedule(null),
      h.taskUpdate,
      [["t-b", { due: "2026-11-20" }]],
    );
    expect(toast.message).toBe("Removed the date from 1 task");
    expect(h.taskUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("bulk move (P21)", () => {
  it("moves the batch to a project, and one undo puts each row back in its own project and section", async () => {
    const a = task("t-a");
    const b = task("t-b", { project: "n-1", section: "Next" });
    select(a, b);

    const toast = await runBatch(
      () => bulk.moveTo("n-2", null),
      h.taskUpdate,
      [
        ["t-a", { project: "", section: "" }],
        ["t-b", { project: "n-1", section: "Next" }],
      ],
    );
    expect(toast.message).toBe("Moved 2 tasks");
    expect(h.taskUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("bulk label (P21)", () => {
  it("adds a label to every row that lacks it, and one undo replaces each row's tags", async () => {
    const a = task("t-a", { tags: ["backend"] });
    const b = task("t-b", { tags: ["api"] });
    select(a, b);

    const toast = await runBatch(
      () => bulk.addLabel("api"),
      h.taskUpdate,
      [["t-a", { tags: "=backend" }]],
    );
    expect(toast.message).toBe("Labelled @api: 1 task");
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
});

describe("bulk delete (P21)", () => {
  it("deletes every row in the batch, and one undo restores every file it removed", async () => {
    const a = task("t-a");
    const b = task("t-b");
    const c = task("t-c");
    select(a, b, c);

    bulk.remove();
    const toast = await undoToast();
    expect(toast.message).toBe("Deleted 3 tasks");
    expect(h.hostTaskDelete.mock.calls).toEqual([["t-a"], ["t-b"], ["t-c"]]);
    expect(h.toast).toHaveBeenCalledTimes(1);

    toast.undo();
    await vi.waitFor(() =>
      expect(h.hostRestore.mock.calls).toEqual([
        [{ path: "tasks/t-a.md", content: "# t-a" }],
        [{ path: "tasks/t-b.md", content: "# t-b" }],
        [{ path: "tasks/t-c.md", content: "# t-c" }],
      ]),
    );
  });
});
