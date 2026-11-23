/**
 * R10 description autosave policy (D1 option 3). The module owns the timing and the
 * client-side precondition, so every rule is asserted here with fake timers and injected I/O —
 * no DOM, no React, no real network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDescriptionAutosave,
  DESCRIPTION_AUTOSAVE_DELAY_MS,
  type AutosaveOutcome,
  type DescriptionSnapshot,
  type FreshDescription,
} from "./description-autosave";
import { CallError } from "./transport";

/** A host stub: `read` answers the current snapshot, `write` records the bodies it persists. */
function host(loaded: DescriptionSnapshot) {
  const writes: string[] = [];
  const reads: number[] = [];
  let onDisk: FreshDescription = { ...loaded, author: null };
  const autosave = (over: Partial<Parameters<typeof createDescriptionAutosave>[0]> = {}) =>
    createDescriptionAutosave({
      loaded,
      read: async () => {
        reads.push(1);
        return onDisk;
      },
      write: async (body) => {
        writes.push(body);
        onDisk = { body, updated: `2026-11-16T10:0${writes.length}:00Z` };
        return { updated: onDisk.updated };
      },
      ...over,
    });
  return {
    writes,
    reads,
    autosave,
    /** Someone else writes the task from outside the editor. */
    laterWriter(body: string, updated: string, author: string | null = "claude") {
      onDisk = { body, updated, author };
    },
  };
}

/** Let chained promise continuations run without advancing the fake clock. */
async function settleMicrotasks() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("description autosave", () => {
  it("waits one second after the last keystroke", () => {
    expect(DESCRIPTION_AUTOSAVE_DELAY_MS).toBe(1000);
    const h = host({ body: "", updated: "T0" });
    const a = h.autosave();
    a.change("a");
    void vi.advanceTimersByTimeAsync(900);
    expect(h.writes).toEqual([]);
    return vi.advanceTimersByTimeAsync(100).then(() => {
      expect(h.writes).toEqual(["a"]);
    });
  });

  it("writes once per pause and never during a continuous burst", async () => {
    const h = host({ body: "", updated: "T0" });
    const a = h.autosave();
    // Nine keystrokes, 300 ms apart: the timer never reaches its full second.
    for (const text of ["T", "Th", "The", "The ", "The b", "The bo", "The bod", "The body", "The body."]) {
      a.change(text);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(h.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.writes).toEqual(["The body."]);
    expect(h.reads).toHaveLength(1);
    // A second pause with no keystrokes in between writes nothing.
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.writes).toEqual(["The body."]);
  });

  it("writes exactly once when the field is left", async () => {
    const h = host({ body: "Loaded", updated: "T0" });
    const a = h.autosave();
    a.change("Loaded and edited");
    await a.blur();
    expect(h.writes).toEqual(["Loaded and edited"]);
    // The blur cancelled the debounce: no second write, now or later.
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.writes).toEqual(["Loaded and edited"]);
    await a.blur();
    expect(h.writes).toEqual(["Loaded and edited"]);
  });

  it("writes nothing when the text still equals the body on disk", async () => {
    const h = host({ body: "Unchanged", updated: "T0" });
    const events: AutosaveOutcome[] = [];
    const a = h.autosave({ onEvent: (event) => events.push(event) });
    a.change("Unchanged!");
    a.change("Unchanged");
    expect(a.dirty()).toBe(false);
    expect(a.scheduled()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await a.blur();
    expect(h.writes).toEqual([]);
    expect(events).toEqual([{ kind: "skipped", body: "Unchanged" }]);
    // Trailing whitespace alone is not a change either.
    a.change("Unchanged\n\n");
    await a.blur();
    expect(h.writes).toEqual([]);
  });

  it("flushes once on unmount and never writes afterwards", async () => {
    const h = host({ body: "", updated: "T0" });
    const a = h.autosave();
    a.change("Half-typed sentence");
    await a.dispose();
    expect(h.writes).toEqual(["Half-typed sentence"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.writes).toEqual(["Half-typed sentence"]);
    // A late change on a disposed controller cannot resurrect a timer.
    a.change("Typed into a dead editor");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.writes).toEqual(["Half-typed sentence"]);
  });

  it("refuses the write and keeps the draft when the task moved on", async () => {
    const h = host({ body: "Loaded", updated: "T0" });
    const events: AutosaveOutcome[] = [];
    const a = h.autosave({ onEvent: (event) => events.push(event) });
    a.change("My draft");
    h.laterWriter("Their newer text", "T1", "claude");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.writes).toEqual([]);
    expect(events).toEqual([
      { kind: "conflict", body: "My draft", loadedUpdated: "T0", freshUpdated: "T1", author: "claude" },
    ]);
    // The draft is still the operator's text, and nothing was persisted.
    expect(a.text()).toBe("My draft");
    expect(a.dirty()).toBe(true);
  });

  it("adopts the updated the host reports, so its own write is not a conflict", async () => {
    const h = host({ body: "", updated: "T0" });
    const a = h.autosave();
    a.change("First");
    await a.blur();
    expect(h.writes).toEqual(["First"]);
    a.change("Second");
    await a.blur();
    expect(h.writes).toEqual(["First", "Second"]);
    expect(h.reads).toHaveLength(2);
  });

  it("writes over a newer body only when the operator chooses Overwrite", async () => {
    const h = host({ body: "Loaded", updated: "T0" });
    const events: AutosaveOutcome[] = [];
    const a = h.autosave({ onEvent: (event) => events.push(event) });
    a.change("My draft");
    h.laterWriter("Their newer text", "T1", "claude");
    await a.blur();
    expect(h.writes).toEqual([]);
    await a.overwrite();
    expect(h.writes).toEqual(["My draft"]);
    expect(events.at(-1)).toEqual({ kind: "saved", body: "My draft", updated: "2026-11-16T10:01:00Z" });
  });

  it("rebases on the reloaded text after Reload", async () => {
    const h = host({ body: "Loaded", updated: "T0" });
    const a = h.autosave();
    a.change("My draft");
    h.laterWriter("Their newer text", "T1", "claude");
    await a.blur();
    a.reset({ body: "Their newer text", updated: "T1" });
    expect(a.text()).toBe("Their newer text");
    expect(a.dirty()).toBe(false);
    a.change("Their newer text, edited");
    await a.blur();
    expect(h.writes).toEqual(["Their newer text, edited"]);
  });

  it("never sends a second write while one is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writes: string[] = [];
    let onDisk = { body: "", updated: "T0" };
    const a = createDescriptionAutosave({
      loaded: onDisk,
      read: async () => onDisk,
      write: async (body) => {
        writes.push(body);
        if (writes.length === 1) await gate;
        onDisk = { body, updated: `T${writes.length}` };
        return { updated: onDisk.updated };
      },
    });
    a.change("Slow write");
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual(["Slow write"]);
    // A blur and a ⌘Enter while the first request is open must not open a second one.
    void a.blur();
    void a.flush();
    expect(writes).toEqual(["Slow write"]);
    a.change("Newer text composed while the first write sends");
    release();
    await settleMicrotasks();
    expect(writes).toEqual(["Slow write", "Newer text composed while the first write sends"]);
  });

  it("drops the pending write when the operator leaves edit mode with Escape", async () => {
    const h = host({ body: "", updated: "T0" });
    const a = h.autosave();
    a.change("Abandoned draft");
    a.cancel();
    await a.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.writes).toEqual([]);
  });

  it("reports a read failure instead of silently losing the draft", async () => {
    const events: AutosaveOutcome[] = [];
    const error = new Error("host offline");
    const a = createDescriptionAutosave({
      loaded: { body: "", updated: "T0" },
      read: async () => { throw error; },
      write: async () => { throw new Error("must not write"); },
      onEvent: (event) => events.push(event),
    });
    a.change("Kept locally");
    await a.blur();
    expect(events).toEqual([{ kind: "error", body: "Kept locally", error }]);
    expect(a.dirty()).toBe(true);
  });
});

/**
 * The host's own precondition (`host_task_set_body { expect_sha256 }`). The stub answers like the
 * real host: it hashes the description on disk, and a write carrying another hash is refused
 * with the core's `conflict` envelope — whatever `updated` says. An editor that saves a body
 * without touching `updated` is the case the timestamp pre-read cannot see.
 */
describe("description autosave — host-side body_sha256 precondition", () => {
  const sha = (body: string) => `sha:${body}`;

  function shaHost(loadedBody: string) {
    let onDisk = loadedBody;
    const sent: Array<{ body: string; expect: string | null }> = [];
    const refuse = () =>
      new CallError(
        "conflict",
        JSON.stringify({ kind: "conflict", message: "description changed", updated: "T0", holder: "claude", kept: "tasks/.conflicts/x.md" }),
        "host_task_set_body",
      );
    return {
      sent,
      /** Another writer replaces the description and leaves `updated` at T0, like a Markdown editor. */
      editorSaves(body: string) {
        onDisk = body;
      },
      disk: () => onDisk,
      autosave(over: Partial<Parameters<typeof createDescriptionAutosave>[0]> = {}) {
        return createDescriptionAutosave({
          loaded: { body: loadedBody, updated: "T0", sha256: sha(loadedBody) },
          // `updated` never moves, so the client-side pre-read passes.
          read: async () => ({ body: onDisk, updated: "T0" }),
          write: async (body, expect) => {
            sent.push({ body, expect });
            if (expect !== null && expect !== sha(onDisk)) throw refuse();
            onDisk = body;
            return { updated: "T0", sha256: sha(body) };
          },
          ...over,
        });
      },
    };
  }

  it("surfaces a stale body_sha256 as a conflict and keeps the draft, instead of discarding it", async () => {
    const h = shaHost("Loaded");
    const events: AutosaveOutcome[] = [];
    const a = h.autosave({ onEvent: (event) => events.push(event) });
    a.change("My draft");
    h.editorSaves("Their text, saved without touching updated");
    await vi.advanceTimersByTimeAsync(1000);

    // The write went out carrying the baseline it loaded, and the host refused it.
    expect(h.sent).toEqual([{ body: "My draft", expect: sha("Loaded") }]);
    expect(events.map((e) => e.kind)).toEqual(["writing", "conflict"]);
    expect(events.at(-1)).toEqual({ kind: "conflict", body: "My draft", loadedUpdated: "T0", freshUpdated: "T0", author: "claude" });
    // Nothing was overwritten and the operator's draft is intact.
    expect(h.disk()).toBe("Their text, saved without touching updated");
    expect(a.text()).toBe("My draft");
    expect(a.dirty()).toBe(true);

    // Autosave stays suspended until the operator chooses.
    a.change("My draft, edited");
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.sent).toHaveLength(1);
  });

  it("chains saves on the hash the host answered, with no re-read in between", async () => {
    const h = shaHost("");
    const a = h.autosave();
    a.change("First");
    await a.blur();
    a.change("Second");
    await a.blur();
    expect(h.sent).toEqual([
      { body: "First", expect: sha("") },
      { body: "Second", expect: sha("First") },
    ]);
  });

  it("Overwrite sends no baseline; Reload rebases on the hash it read", async () => {
    const h = shaHost("Loaded");
    const a = h.autosave();
    a.change("My draft");
    h.editorSaves("Theirs");
    await a.blur();
    await a.overwrite();
    expect(h.sent.at(-1)).toEqual({ body: "My draft", expect: null });
    expect(h.disk()).toBe("My draft");

    const b = h.autosave();
    b.change("Another draft");
    h.editorSaves("Theirs again");
    await b.blur();
    b.reset({ body: "Theirs again", updated: "T0", sha256: sha("Theirs again") });
    b.change("Theirs again, edited");
    await b.blur();
    expect(h.sent.at(-1)).toEqual({ body: "Theirs again, edited", expect: sha("Theirs again") });
    expect(h.disk()).toBe("Theirs again, edited");
  });

  it("a host that reports no hash is written without a baseline, as before", async () => {
    const h = shaHost("Loaded");
    const a = h.autosave({ loaded: { body: "Loaded", updated: "T0" } });
    a.change("Draft");
    await a.blur();
    expect(h.sent).toEqual([{ body: "Draft", expect: null }]);
  });

  it("any other write failure stays an error, not a conflict", async () => {
    const events: AutosaveOutcome[] = [];
    const error = new CallError("validation", "no such task", "host_task_set_body");
    const a = createDescriptionAutosave({
      loaded: { body: "", updated: "T0", sha256: sha("") },
      read: async () => ({ body: "", updated: "T0" }),
      write: async () => { throw error; },
      onEvent: (event) => events.push(event),
    });
    a.change("Draft");
    await a.blur();
    expect(events.at(-1)).toEqual({ kind: "error", body: "Draft", error });
  });
});
