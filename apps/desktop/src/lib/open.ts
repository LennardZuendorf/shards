/**
 * "Open in" (R41): open a vault file outside Shards. The desktop app goes through the
 * `shards_open` command (Rust checks the path is inside a space root); browser mode can only
 * follow an `obsidian://` link.
 */
import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { runtime } from "./transport";

export type OpenTarget = "obsidian" | "default" | "reveal";
/** The targets a default can be chosen from (Settings). */
export type DefaultOpenTarget = Exclude<OpenTarget, "reveal">;

export const OPEN_TARGET_LABEL: Record<OpenTarget, string> = {
  obsidian: "Obsidian",
  default: "Default app",
  reveal: "Finder",
};

/** Mirrors `shards_host::obsidian_url`: every byte outside RFC 3986 "unreserved" is escaped. */
export function obsidianUrl(absPath: string): string {
  let out = "";
  for (const b of new TextEncoder().encode(absPath)) {
    const c = String.fromCharCode(b);
    out += /[A-Za-z0-9\-_.~]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return `obsidian://open?path=${out}`;
}

/** Which targets this runtime and vault offer, in menu order. */
export function availableTargets(opts: { obsidian: boolean; desktop: boolean }): OpenTarget[] {
  const out: OpenTarget[] = [];
  if (opts.obsidian) out.push("obsidian");
  if (opts.desktop) out.push("default", "reveal");
  return out;
}

/** The preferred target when available, else the first available one, else `null`. */
export function pickDefault(available: OpenTarget[], preferred: DefaultOpenTarget): OpenTarget | null {
  if (available.includes(preferred)) return preferred;
  return available.find((t) => t !== "reveal") ?? available[0] ?? null;
}

/* ----------------------------------------------------------- preference */

const PREF_KEY = "shards.openIn";
const listeners = new Set<() => void>();

export function getOpenPreference(): DefaultOpenTarget {
  try {
    return localStorage.getItem(PREF_KEY) === "default" ? "default" : "obsidian";
  } catch {
    return "obsidian";
  }
}

export function setOpenPreference(t: DefaultOpenTarget) {
  try {
    localStorage.setItem(PREF_KEY, t);
  } catch {
    /* per-viewer convenience only */
  }
  for (const l of listeners) l();
}

export function useOpenPreference(): DefaultOpenTarget {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getOpenPreference,
    getOpenPreference,
  );
}

/* --------------------------------------------------------------- action */

export async function openFile(absPath: string, target: OpenTarget): Promise<void> {
  if (runtime() === "tauri") {
    await invoke("shards_open", { path: absPath, with: target });
    return;
  }
  if (target !== "obsidian") throw new Error(`${OPEN_TARGET_LABEL[target]} is only available in the desktop app`);
  window.location.assign(obsidianUrl(absPath));
}
