/**
 * Core-correct update arguments. The core treats `null` as an absent key and clears a v2 field
 * (and `project`) only on an empty string, so the UI's `null` ("clear") must become `""` on the
 * wire, and an inverse (undo) must use `""` for fields that were unset before.
 */
import type { TaskUpdateArgs } from "@/lib/api";
import { tagSpec } from "@/lib/api";
import { CallError } from "@/lib/transport";
import type { Task } from "@/lib/types";

/** Keys the core clears with `""`. */
export const CLEARABLE = ["due", "deadline", "recur", "recur_from", "parent", "section", "order", "project"] as const;
type Clearable = (typeof CLEARABLE)[number];
const isClearable = (k: string): k is Clearable => (CLEARABLE as readonly string[]).includes(k);

/** UI args → wire args: `null` on a clearable key becomes `""`; other `null`s are dropped. */
export function toWire(args: TaskUpdateArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    if (v === null || v === "") {
      if (isClearable(k)) out[k] = "";
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Wire args → an optimistic preview patch (`""` shown as unset). */
export function toPreview(args: TaskUpdateArgs): TaskUpdateArgs {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    out[k] = v === "" && isClearable(k) ? null : v;
  }
  return out as TaskUpdateArgs;
}

/** The update that restores `before` for every field `args` touches (wire-ready). */
export function inverseOf(before: Task, args: TaskUpdateArgs): TaskUpdateArgs {
  const b = before as unknown as Record<string, unknown>;
  const inv: Record<string, unknown> = {};
  for (const k of Object.keys(args)) {
    if (k === "tags") {
      inv.tags = tagSpec.replace(before.tags);
    } else if (k === "status") {
      // Only `open` is settable through update; restoring another status is not possible here.
      continue;
    } else if (isClearable(k)) {
      const v = b[k];
      inv[k] = v === null || v === undefined || v === "" ? "" : v;
    } else if (k === "priority") {
      inv.priority = b.priority ?? "normal";
    } else if (b[k] !== undefined && b[k] !== null) {
      inv[k] = b[k];
    }
  }
  return inv as TaskUpdateArgs;
}

/** Non-empty v2 values the response does not carry (the core silently ignored them). */
export function droppedFields(wire: Record<string, unknown>, res: Task): string[] {
  const r = res as unknown as Record<string, unknown>;
  return (["due", "deadline", "recur", "recur_from", "parent", "section", "order"] as const).filter(
    (k) => wire[k] !== undefined && wire[k] !== "" && (r[k] === undefined || r[k] === null),
  );
}

/** True when the host does not implement a tool yet (older `shards-host`). */
export function isUnknownTool(e: unknown): boolean {
  return e instanceof CallError && /unknown tool/i.test(e.message);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
