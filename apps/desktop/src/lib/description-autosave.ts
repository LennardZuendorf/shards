/**
 * R10 description autosave — the policy, with no React and no DOM.
 *
 * The description saves one second after typing stops and when the field is left (R10). A write
 * is refused when the task's `updated` moved since the editor loaded it, so autosave cannot
 * clobber a newer body written by another writer (desktop-app R26, D1 option 3 recorded
 * 2026-11-16): every write re-reads the task and compares `task.updated` against the value the
 * editor loaded, and a mismatch leaves the draft untouched and names the later writer. The host
 * then checks the description itself: each write carries the `body_sha256` last read, and a
 * `conflict` refusal (an editor that saved without touching `updated`) ends the same way.
 *
 * Timers and I/O are injected, so every rule below is unit-tested with fake timers.
 */

/** R10: "the description one second after typing stops and on leaving the field". */
export const DESCRIPTION_AUTOSAVE_DELAY_MS = 1000;

/** A description, the `task.updated` it was read at, and the `body_sha256` the host reported for it. */
export interface DescriptionSnapshot {
  body: string;
  updated: string | null;
  /**
   * The host's hash of the task body this was read from (`shards_task_get` `body_sha256`). Each
   * write sends it as `expect_sha256`, so the host itself refuses a write over a description
   * that changed — including a body edit that left `updated` alone. Absent on a host that does
   * not report it; the write then carries no baseline, as before.
   */
  sha256?: string | null;
}

/** A fresh read of the task, plus the best attribution the vault can offer for it. */
export interface FreshDescription extends DescriptionSnapshot {
  /** `claimed_by` / `owner` when it is not the operator, else `null` (the vault records no writer). */
  author?: string | null;
}

export type AutosaveOutcome =
  | { kind: "writing"; body: string }
  | { kind: "saved"; body: string; updated: string | null }
  /** Nothing to write: the draft still equals the body already on disk. */
  | { kind: "skipped"; body: string }
  | {
      kind: "conflict";
      body: string;
      loadedUpdated: string | null;
      freshUpdated: string | null;
      author: string | null;
    }
  | { kind: "error"; body: string; error: unknown };

export interface AutosaveTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface DescriptionAutosaveOptions {
  /** The description the editor loaded, and `task.updated` at that moment. */
  loaded: DescriptionSnapshot;
  /** Text already in the editor when it re-attaches (a relocated draft). Defaults to `loaded.body`. */
  text?: string;
  /** Re-read the task from the host, immediately before each write. */
  read: () => Promise<FreshDescription>;
  /**
   * Persist one description; resolves with the `updated` the host reports for the write and the
   * `body_sha256` of what it left on disk. `expectSha256` is the baseline the host must still
   * find (`null`: no baseline — an explicit Overwrite, or a host that reports none). A host
   * refusal is a thrown error for which {@link conflictOf} answers.
   */
  write: (body: string, expectSha256: string | null) => Promise<{ updated: string | null; sha256?: string | null }>;
  onEvent?: (event: AutosaveOutcome) => void;
  delayMs?: number;
  timers?: AutosaveTimers;
}

export interface DescriptionAutosave {
  /** A keystroke: schedule the one-second write. */
  change(next: string): void;
  /** Leaving the field: write now. */
  blur(): Promise<void>;
  /** ⌘Enter: write now. */
  flush(): Promise<void>;
  /** An explicit "Overwrite" after a refusal (R26): write now, ignoring the precondition. */
  overwrite(): Promise<void>;
  /** Take the reloaded disk text (R26 "Reload"): drop the refused draft and rebase on it. */
  reset(next: DescriptionSnapshot): void;
  /** Leaving edit mode without writing (Escape, D2): drop the pending write. */
  cancel(): void;
  /** Unmount: write what is pending, then stop for good. */
  dispose(): Promise<void>;
  text(): string;
  dirty(): boolean;
  /** True while a write is scheduled and has not fired yet. */
  scheduled(): boolean;
}

/**
 * The host's refusal of a write over a changed description: a `conflict`-kind error (core exit 4)
 * whose envelope names the `updated` on disk now and the best attribution it has (`holder`).
 * Duck-typed on `kind`, so this module needs no transport import.
 */
export function conflictOf(error: unknown): { updated: string | null; holder: string | null } | null {
  const e = error as { kind?: unknown; envelope?: { updated?: unknown; holder?: unknown } | null } | null;
  if (!e || e.kind !== "conflict") return null;
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return { updated: text(e.envelope?.updated), holder: text(e.envelope?.holder) };
}

/** Trailing whitespace is not a change: `joinBody`/`set_body` both trim it on the way to disk. */
const settled = (text: string) => text.replace(/\s+$/, "");

export function createDescriptionAutosave(opts: DescriptionAutosaveOptions): DescriptionAutosave {
  const delayMs = opts.delayMs ?? DESCRIPTION_AUTOSAVE_DELAY_MS;
  const timers: AutosaveTimers = opts.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  };

  let draft = opts.text ?? opts.loaded.body;
  /** The description last known to be on disk (loaded, or the last successful write). */
  let persisted = settled(opts.loaded.body);
  /** `task.updated` for `persisted`: the precondition every write is checked against. */
  let baseline = opts.loaded.updated;
  /** `body_sha256` for `persisted`: the baseline the host re-checks under its own lock. */
  let baselineSha = opts.loaded.sha256 ?? null;
  let handle: unknown = null;
  let scheduled = false;
  let running: Promise<void> | null = null;
  let again = false;
  let disposed = false;
  let cancelled = false;
  /** A refused write suspends autosave until the operator picks Reload or Overwrite (R26). */
  let blocked = false;

  const emit = (event: AutosaveOutcome) => opts.onEvent?.(event);
  const dirty = () => settled(draft) !== persisted;

  function clearTimer() {
    if (!scheduled) return;
    timers.clearTimeout(handle);
    handle = null;
    scheduled = false;
  }

  function schedule() {
    clearTimer();
    if (disposed || cancelled || blocked) return;
    scheduled = true;
    handle = timers.setTimeout(() => {
      handle = null;
      scheduled = false;
      void flush();
    }, delayMs);
  }

  /** One read + (guarded) write. `force` is the operator's explicit Overwrite. */
  async function attempt(force: boolean): Promise<void> {
    const body = draft;
    if (!force && settled(body) === persisted) {
      emit({ kind: "skipped", body });
      return;
    }
    let fresh: FreshDescription;
    try {
      fresh = await opts.read();
    } catch (error) {
      emit({ kind: "error", body, error });
      return;
    }
    if (!force && fresh.updated !== baseline) {
      blocked = true;
      emit({ kind: "conflict", body, loadedUpdated: baseline, freshUpdated: fresh.updated, author: fresh.author ?? null });
      return;
    }
    emit({ kind: "writing", body });
    try {
      const { updated, sha256 } = await opts.write(body, force ? null : baselineSha);
      persisted = settled(body);
      baseline = updated;
      baselineSha = sha256 ?? null;
      emit({ kind: "saved", body, updated });
    } catch (error) {
      const refused = conflictOf(error);
      if (refused) {
        // The pre-read above only sees `updated`; the host compared the description itself and
        // found it changed. Same outcome: the draft stays and autosave waits for Reload/Overwrite.
        blocked = true;
        emit({ kind: "conflict", body, loadedUpdated: baseline, freshUpdated: refused.updated, author: refused.holder });
      } else emit({ kind: "error", body, error });
    }
  }

  function flush(force = false): Promise<void> {
    clearTimer();
    if (disposed || cancelled) return Promise.resolve();
    // After a refusal the editor waits for the operator's choice; only Overwrite writes again.
    if (blocked && !force) return Promise.resolve();
    // One write at a time: a request that arrives mid-flight is replayed when it lands, so a
    // relocation or a ⌘Enter during a slow write cannot produce a duplicate request.
    if (running) {
      again = true;
      return running;
    }
    running = attempt(force).finally(() => {
      running = null;
      if (again) {
        again = false;
        if (!disposed && !cancelled && dirty()) void flush(force);
      }
    });
    return running;
  }

  return {
    change(next) {
      draft = next;
      if (disposed || cancelled) return;
      // Typing back to the body already on disk cancels the pending write instead of sending it.
      if (!dirty()) clearTimer();
      else schedule();
    },
    blur: () => flush(),
    flush: () => flush(),
    overwrite() {
      blocked = false;
      return flush(true);
    },
    reset(next) {
      clearTimer();
      draft = next.body;
      persisted = settled(next.body);
      baseline = next.updated;
      baselineSha = next.sha256 ?? null;
      cancelled = false;
      blocked = false;
    },
    cancel() {
      clearTimer();
      cancelled = true;
    },
    async dispose() {
      if (cancelled || disposed) {
        clearTimer();
        disposed = true;
        return;
      }
      await flush();
      while (again && !cancelled) {
        again = false;
        await flush();
      }
      disposed = true;
      clearTimer();
    },
    text: () => draft,
    dirty,
    scheduled: () => scheduled,
  };
}
