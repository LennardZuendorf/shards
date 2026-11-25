/**
 * "Add project" — the create path: the note, the two optional frontmatter writes, and the way out.
 *
 * The real `AddProjectDialog` is rendered with `renderToStaticMarkup` (there is no DOM on this
 * host; see the desktop README), and everything that needs a browser is a recorder:
 *
 * - `@/lib/api` is the transport: `noteNew` / `hostProjectUpdate` are recorded, so every write is
 *   asserted as the arguments the host would receive;
 * - `@/components/ui/{dialog,input,button}` record the handler a keystroke or a click would run and
 *   still render the markup the assertions read. The ten swatches are plain `<button>`s in the
 *   shipped JSX, so their `onClick` is taken from the element tree the dialog hands `DialogContent`;
 * - `@/lib/router` records `navigate`; `paths` is the shipped one.
 *
 * One shim, for the same reason `views/scratch/scratch-manager.test.tsx` shims
 * `useDetailDraftState`: a server render is a single pass with no event loop, so the form's own
 * `useState` could never re-render after a keystroke and `submit` would only ever see the empty
 * title. `react.useState` is therefore backed by a cell store — a setter writes a cell, the next
 * pass reads it. Nothing else is replaced: `onChange`, the swatch `onClick` and `submit` are the
 * shipped closures, and the assertions read the markup and the transport arguments they produce.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Note, Project } from "@/lib/types";

/* ---------------------------------------------------------------- fixtures */

/** What `shards_note_new` answers: the project note the dialog will open. */
const NEW_ID = "n-garden-new";
const note = (title: string): Note => ({
  id: NEW_ID,
  type: "project",
  title,
  tags: [],
  owner: null,
  created: null,
  updated: null,
});

/** A project somebody has already dragged in the sidebar — the rows the `order` branch reads. */
const ranked = (id: string, order: number): Project => ({
  id,
  title: id,
  color: null,
  sections: [],
  open_count: 0,
  order,
});

/* --------------------------------------------------------------- recorders */

/**
 * The form's state, one cell per `useState` call in render order. `begin()` rewinds the cursor
 * before each pass; the cells themselves survive, which is what a mounted component's state does.
 */
const form = vi.hoisted(() => ({
  cells: [] as unknown[],
  cursor: 0,
  useState(init: unknown): [unknown, (next: unknown) => void] {
    const i = this.cursor++;
    if (!(i in this.cells)) this.cells[i] = typeof init === "function" ? (init as () => unknown)() : init;
    const set = (next: unknown) => {
      this.cells[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(this.cells[i]) : next;
    };
    return [this.cells[i], set];
  },
  begin() {
    this.cursor = 0;
  },
  reset() {
    this.cells.length = 0;
    this.cursor = 0;
  },
}));

const rec = vi.hoisted(() => ({
  /** The title input's props on the last pass (its `onChange`/`onKeyDown` are the shipped ones). */
  input: null as { value: string; onChange?: (e: { target: { value: string } }) => void } | null,
  /** Button label → the `onClick` a click would run; and the labels rendered disabled. */
  buttons: new Map<string, () => void>(),
  disabled: new Set<string>(),
  /** Swatch label (`aria-label`) → the shipped `onClick`, from the element tree. */
  swatches: new Map<string, () => void>(),
  /** Flatten element children to their text, for labelling a control. */
  label(children: unknown): string {
    if (children == null || typeof children === "boolean") return "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map((c) => this.label(c)).join(" ");
    const el = children as { props?: { children?: unknown } };
    return el.props ? this.label(el.props.children) : "";
  },
  /** Every `<button aria-label=…>` in a dialog's children, in document order. */
  collect(node: unknown) {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) this.collect(child);
      return;
    }
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    const props = el.props;
    if (!props) return;
    const label = props["aria-label"];
    if (el.type === "button" && typeof label === "string" && typeof props.onClick === "function") {
      this.swatches.set(label, props.onClick as () => void);
    }
    this.collect(props.children);
  },
  /** Forget one pass' handlers (the state cells keep what the pass' setters wrote). */
  pass() {
    this.input = null;
    this.buttons.clear();
    this.disabled.clear();
    this.swatches.clear();
  },
}));

/* ------------------------------------------------------------------ mocks */

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    noteNew: vi.fn(async (args: { title: string }) => note(args.title)),
    hostProjectUpdate: vi.fn(async (id: string, set: Record<string, unknown>) => ({ ...note(""), id, ...set })),
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/router")>();
  return { ...actual, navigate: vi.fn() };
});

/** The shim described in the header: the pass' `useState` reads and writes the cells. */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (init: unknown) => form.useState(init) };
});

/** Closed dialogs render nothing; `DialogContent` hands over the element tree so swatches are reachable. */
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => {
    rec.collect(children);
    return <div>{children}</div>;
  },
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/input")>();
  return {
    ...actual,
    Input: (props: { value?: string; placeholder?: string; onChange?: (e: { target: { value: string } }) => void }) => {
      rec.input = { value: props.value ?? "", onChange: props.onChange };
      return <input value={props.value} placeholder={props.placeholder} readOnly />;
    },
  };
});

vi.mock("@/components/ui/button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  return {
    ...actual,
    Button: ({ children, onClick, disabled }: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) => {
      const label = rec.label(children).trim().replace(/\s+/g, " ");
      // A disabled button runs nothing, exactly as in the browser: it is not offered as a handler.
      if (disabled) rec.disabled.add(label);
      else if (onClick) rec.buttons.set(label, onClick);
      return (
        <button type="button" disabled={disabled}>
          {children}
        </button>
      );
    },
  };
});

import { hostProjectUpdate, noteNew } from "@/lib/api";
import { qk } from "@/lib/query";
import { navigate, paths } from "@/lib/router";
import { ORDER_STEP } from "@/components/task/model";
import { PROJECT_COLORS } from "@/components/task/project-actions";
import { toast } from "sonner";
import { AddProjectDialog } from "./AddProjectDialog";

/* ----------------------------------------------------------------- helpers */

let client: QueryClient;
let onOpenChange: Mock<(v: boolean) => void>;

/** A client whose project rows are whatever the test says the sidebar is showing. */
function mount(rows: Project[] = []) {
  client = new QueryClient();
  if (rows.length) client.setQueryData<Project[]>(qk.host.projects, rows);
  onOpenChange = vi.fn<(v: boolean) => void>();
}

/** One server pass: the state the previous pass' setters wrote, rendered. */
function draw(): string {
  form.begin();
  rec.pass();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AddProjectDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
}

/** Type into the shipped `onChange`, then come back with a pass that sees the new title. */
function type(title: string) {
  draw();
  const onChange = rec.input?.onChange;
  if (!onChange) throw new Error("the dialog rendered no title input");
  onChange({ target: { value: title } });
}

function press(label: string) {
  const hit = rec.buttons.get(label);
  if (!hit) throw new Error(`no “${label}” button; rendered: ${[...rec.buttons.keys()].join(", ")}`);
  hit();
}

function swatch(label: string) {
  const hit = rec.swatches.get(label);
  if (!hit) throw new Error(`no “${label}” swatch; rendered: ${[...rec.swatches.keys()].join(", ")}`);
  hit();
}

/** The swatch row as the markup shows it: each button's accessibility label and pressed state. */
function swatches(markup: string) {
  return [...markup.matchAll(/<button\b[^>]*>/g)]
    .map(([tag]) => {
      const label = /aria-label="([^"]+)"/.exec(tag)?.[1];
      return label ? { label, pressed: /aria-pressed="true"/.test(tag) } : null;
    })
    .filter((s): s is { label: string; pressed: boolean } => s !== null);
}

const updates = () => vi.mocked(hostProjectUpdate).mock.calls as [string, Record<string, unknown>][];
const creates = () => vi.mocked(noteNew).mock.calls as [{ title: string; note_type?: string }][];

beforeEach(() => {
  form.reset();
  rec.pass();
  vi.mocked(noteNew).mockClear();
  // One-shot refusals (`mockRejectedValueOnce`) are spent per test; the implementations stay put.
  vi.mocked(hostProjectUpdate).mockClear();
  vi.mocked(navigate).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

/* ------------------------------------------------------------------- tests */

describe("Add project — the create path", () => {
  it("creates one project note, writes nothing else when nothing was chosen, then opens it", async () => {
    mount();

    // Nothing typed yet: the Add button is disabled and offers no handler, so a click is inert.
    draw();
    expect(rec.disabled.has("Add project")).toBe(true);
    expect(rec.buttons.has("Add project")).toBe(false);

    type("Garden");
    const markup = draw();
    expect(markup).toContain('value="Garden"');
    expect(rec.disabled.has("Add project")).toBe(false);

    press("Add project");

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(creates()).toEqual([[{ title: "Garden", note_type: "project" }]]);
    // No colour, no ranked list: the note alone, no metadata write at all.
    expect(updates()).toEqual([]);
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.project(NEW_ID)]]);
    // The dialog closes itself — the operator is on the new project's page, not on a stale dialog.
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(vi.mocked(toast.success).mock.calls).toEqual([["Project “Garden” created"]]);
  });

  it("writes the chosen colour onto the new note", async () => {
    mount();

    draw();
    swatch("green");
    expect(swatches(draw()).filter((s) => s.pressed)).toEqual([{ label: "green", pressed: true }]);

    type("Garden");
    draw();
    press("Add project");

    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()).toEqual([[NEW_ID, { color: "green" }]]);
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.project(NEW_ID)]]);
  });

  it("ranks a new project below the ranked ones: the highest cached order plus ORDER_STEP", async () => {
    mount([ranked("n-plan", 1024), ranked("n-build", 2048)]);

    type("Garden");
    draw();
    press("Add project");

    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    // model.ts's step is what the sidebar's drag writes; the new row goes after the last one,
    // i.e. 2048 + ORDER_STEP = 3072.
    expect(ORDER_STEP).toBe(1024);
    expect(updates()).toEqual([[NEW_ID, { order: 2048 + ORDER_STEP }]]);
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.project(NEW_ID)]]);
  });

  it("writes no order when the sidebar still has an unranked row", async () => {
    // A fresh number would sort the new project *above* the unranked row (ranked rows come
    // first), not below it — so a mixed list is left alone and the first drag ranks it.
    mount([ranked("n-plan", 1024), { ...ranked("n-loose", 0), order: null }]);

    type("Garden");
    draw();
    press("Add project");

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(updates()).toEqual([]);
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.project(NEW_ID)]]);
  });

  it("keeps the project when the metadata write fails: it still opens and closes", async () => {
    mount();
    // The host that predates `host_project_update` refuses the colour write.
    let refusals = 0;
    vi.mocked(hostProjectUpdate).mockImplementationOnce(async () => {
      refusals++;
      throw new Error("unknown tool: host_project_update");
    });

    draw();
    swatch("green");
    type("Garden");
    draw();
    press("Add project");

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    // The write was attempted and refused…
    expect(refusals).toBe(1);
    expect(updates()).toEqual([[NEW_ID, { color: "green" }]]);
    // …and the project is not lost with it.
    expect(creates()).toEqual([[{ title: "Garden", note_type: "project" }]]);
    expect(vi.mocked(navigate).mock.calls).toEqual([[paths.project(NEW_ID)]]);
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });
});

describe("Add project — the colour row", () => {
  it("renders one labelled swatch per PROJECT_COLORS entry, and clicking the chosen one clears it", () => {
    mount();

    const before = swatches(draw());
    expect(before.map((s) => s.label)).toEqual([...PROJECT_COLORS]);
    expect(before).toHaveLength(10);
    expect(before.some((s) => s.pressed)).toBe(false);

    swatch("green");
    expect(swatches(draw()).filter((s) => s.pressed)).toEqual([{ label: "green", pressed: true }]);

    // The same swatch again is the "no colour" state's way back.
    swatch("green");
    expect(swatches(draw()).some((s) => s.pressed)).toBe(false);
  });
});
