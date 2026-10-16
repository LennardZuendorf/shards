/**
 * Graceful degradation for UI-only host tools (`host_*`). An older shards-host answers
 * `{kind: "validation", message: "unknown tool: 'host_x'"}`; we key off the message so a
 * disabled space (also `validation`) is not mistaken for a missing tool.
 */
import { CallError } from "@/lib/transport";

export function isUnknownTool(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const raw = err instanceof CallError ? `${err.message} ${err.raw}` : err.message;
  return /unknown tool/i.test(raw);
}

/** A disabled space errors with `validation` and a message naming the space root. */
export function isSpaceDisabled(err: unknown): boolean {
  if (!(err instanceof CallError) || isUnknownTool(err)) return false;
  return err.kind === "validation" && /(disabled|not configured|no .*root|space)/i.test(err.message);
}

/** User-facing text for an error, with a clear hint when the host lacks a tool. */
export function describeError(err: unknown, action = "This action"): string {
  if (isUnknownTool(err)) return `${action} needs a newer Shards host (tool not available yet).`;
  if (err instanceof Error) return err.message;
  return String(err);
}
