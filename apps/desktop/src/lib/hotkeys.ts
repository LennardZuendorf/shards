/**
 * Global keyboard shortcut registry.
 *
 * Keys: `"q"`, `"mod+k"` (⌘ on macOS, Ctrl elsewhere), `"shift+?"`, sequences `"g t"`.
 * Plain keys never fire while typing (input, textarea, select, contenteditable) unless
 * `allowInInput` is set; `mod+…` combos fire everywhere by default.
 * Later registrations win over earlier ones for the same key (views can override the shell).
 */
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

export interface HotkeyDef {
  keys: string;
  handler: (e: KeyboardEvent) => void;
  /** Shown in the shortcuts sheet / palette. */
  description?: string;
  group?: string;
  allowInInput?: boolean;
  /** Keep the browser default (no preventDefault). */
  allowDefault?: boolean;
}

interface Entry extends HotkeyDef {
  id: number;
  steps: Combo[];
}

interface Combo {
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean | null; // null = don't care (symbols)
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

function parseCombo(s: string): Combo {
  const parts = s.toLowerCase().split("+").map((p) => p.trim());
  let key = parts.pop() ?? "";
  if (key === "") key = "+";
  const has = (m: string) => parts.includes(m);
  const isLetter = /^[a-z0-9]$/.test(key) || key.length > 1;
  return {
    key: key === "space" ? " " : key === "esc" ? "escape" : key,
    mod: has("mod") || has("cmd") || has("ctrl") || has("meta"),
    alt: has("alt") || has("option"),
    shift: has("shift") ? true : isLetter ? false : null,
  };
}

function parse(keys: string): Combo[] {
  return keys.trim().split(/\s+/).map(parseCombo);
}

function matches(c: Combo, e: KeyboardEvent): boolean {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (c.mod !== mod) return false;
  if (!isMac && e.metaKey) return false;
  if (isMac && e.ctrlKey && !c.mod) return false;
  if (c.alt !== e.altKey) return false;
  if (c.shift !== null && c.shift !== e.shiftKey) return false;
  const key = e.key.toLowerCase();
  if (key === c.key) return true;
  // Alt/shift can change e.key on some layouts; fall back to the physical key for letters/digits.
  const code = e.code.toLowerCase();
  return (code === `key${c.key}` || code === `digit${c.key}`) && c.key.length === 1;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.("[contenteditable=''], [contenteditable='true'], [cmdk-root]");
}

/* ------------------------------------------------------------- registry */

const entries = new Map<number, Entry>();
let nextId = 1;
let version = 0;
const listeners = new Set<() => void>();
let installed = false;
let pending: { entries: Entry[]; step: number; timer: ReturnType<typeof setTimeout> } | null = null;

function notify() {
  version++;
  for (const l of listeners) l();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
  const editable = isEditableTarget(e.target);
  const list = [...entries.values()].reverse();

  // continue a sequence
  if (pending) {
    const step = pending.step;
    const cands = pending.entries.filter((en) => en.steps[step] && matches(en.steps[step], e));
    clearTimeout(pending.timer);
    pending = null;
    const done = cands.find((en) => en.steps.length === step + 1);
    if (done) {
      if (!done.allowDefault) e.preventDefault();
      done.handler(e);
      return;
    }
    if (cands.length) {
      pending = { entries: cands, step: step + 1, timer: setTimeout(() => (pending = null), 1000) };
      e.preventDefault();
      return;
    }
  }

  const eligible = list.filter((en) => !editable || en.allowInInput || (en.allowInInput !== false && en.steps[0].mod));
  const single = eligible.find((en) => en.steps.length === 1 && matches(en.steps[0], e));
  if (single) {
    if (!single.allowDefault) e.preventDefault();
    single.handler(e);
    return;
  }
  const starts = eligible.filter((en) => en.steps.length > 1 && matches(en.steps[0], e));
  if (starts.length) {
    pending = { entries: starts, step: 1, timer: setTimeout(() => (pending = null), 1000) };
  }
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", onKeyDown);
}

/** Register a shortcut; returns an unregister function. */
export function registerHotkey(def: HotkeyDef): () => void {
  install();
  const id = nextId++;
  entries.set(id, { ...def, id, steps: parse(def.keys) });
  notify();
  return () => {
    entries.delete(id);
    notify();
  };
}

/** React hook form of `registerHotkey`. The handler may change between renders freely. */
export function useHotkey(keys: string, handler: (e: KeyboardEvent) => void, opts: Omit<HotkeyDef, "keys" | "handler"> & { enabled?: boolean } = {}) {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  const { enabled = true, description, group, allowInInput, allowDefault } = opts;
  useEffect(() => {
    if (!enabled) return;
    return registerHotkey({ keys, handler: (e) => ref.current(e), description, group, allowInInput, allowDefault });
  }, [keys, enabled, description, group, allowInInput, allowDefault]);
}

let listCache: { v: number; list: HotkeyDef[] } = { v: -1, list: [] };

/** Registered shortcuts with a description (for a help sheet). */
export function useHotkeyList(): HotkeyDef[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      if (listCache.v !== version) {
        const seen = new Set<string>();
        const list: HotkeyDef[] = [];
        for (const e of [...entries.values()].reverse()) {
          if (!e.description || seen.has(e.keys)) continue;
          seen.add(e.keys);
          list.push(e);
        }
        listCache = { v: version, list: list.reverse() };
      }
      return listCache.list;
    },
  );
}

/** Render a key string for display: `"mod+k"` → `["⌘", "K"]`. */
export function formatKeys(keys: string): string[] {
  return keys
    .trim()
    .split(/\s+/)
    .flatMap((step, i) => {
      const parts = step.split("+").map((p) => {
        const k = p.toLowerCase();
        if (k === "mod") return isMac ? "⌘" : "Ctrl";
        if (k === "shift") return isMac ? "⇧" : "Shift";
        if (k === "alt") return isMac ? "⌥" : "Alt";
        if (k === "enter") return "↵";
        if (k === "escape" || k === "esc") return "Esc";
        if (k === "backspace") return "⌫";
        if (k === "arrowup") return "↑";
        if (k === "arrowdown") return "↓";
        return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
      });
      return i > 0 ? ["then", ...parts] : parts;
    });
}
