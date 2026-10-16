/**
 * Resolve a typed `+assignee` to a configured member. Members are config-only (`[[members]]`
 * plus identities seen in the vault): quick add never creates one, so a name that resolves to
 * nobody blocks the submit instead of failing in the core with `unknown owner`.
 */
import type { Member } from "../types";

export type OwnerResolution =
  | { status: "none" }
  | { status: "resolved"; member: Member }
  /** Several members share the typed prefix. */
  | { status: "ambiguous"; raw: string; matches: Member[] }
  | { status: "unknown"; raw: string };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Exact id, then exact name (case and punctuation folded), then a unique prefix of an id or name. */
export function resolveOwner(raw: string | null | undefined, members: readonly Member[]): OwnerResolution {
  const typed = raw?.trim();
  if (!typed) return { status: "none" };
  const byId = members.find((m) => m.id === typed);
  if (byId) return { status: "resolved", member: byId };
  const n = norm(typed);
  if (!n) return { status: "unknown", raw: typed };
  const exact = members.filter((m) => norm(m.id) === n || norm(m.name) === n);
  if (exact.length === 1) return { status: "resolved", member: exact[0] };
  // One member counts once, even when the prefix matches both its id and its name.
  const prefixed = members.filter((m) => norm(m.id).startsWith(n) || norm(m.name).startsWith(n));
  if (prefixed.length === 1) return { status: "resolved", member: prefixed[0] };
  if (prefixed.length > 1 || exact.length > 1) return { status: "ambiguous", raw: typed, matches: exact.length > 1 ? exact : prefixed };
  return { status: "unknown", raw: typed };
}
