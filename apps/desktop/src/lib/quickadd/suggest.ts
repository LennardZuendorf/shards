/**
 * Quick-add autocomplete: find the sigil the caret is completing (`#Sha|`, `@rev|`, `+cla|`,
 * `/Bu|`) and rank candidates for it. Pure functions; the form renders the popover.
 */
import type { NameKind } from "./parse";

export const SIGIL_KIND: Record<string, NameKind> = { "#": "project", "/": "section", "@": "label", "+": "owner" };

export interface Trigger {
  kind: NameKind;
  sigil: string;
  /** Index of the sigil character. */
  start: number;
  /** The text typed after the sigil, up to the caret. */
  query: string;
}

export interface Candidate {
  /** What the popover shows. */
  label: string;
  /** What gets inserted after the sigil (the canonical spelling the parser knows). */
  insert: string;
  /** Extra words that also match (member id, project slug …). */
  aliases?: string[];
  hint?: string;
  /** Opaque key for React and for the caller (project id, member id …). */
  key: string;
}

/**
 * The sigil token the caret sits in, if any. A trigger may span spaces (`#Shards La|`) so long
 * as some candidate still starts with the query; the caller passes `hasPrefix` to check that.
 */
export function activeTrigger(text: string, caret: number, hasPrefix: (kind: NameKind, query: string) => boolean): Trigger | null {
  const upto = text.slice(0, caret);
  for (let i = upto.length - 1; i >= 0 && upto.length - i <= 48; i--) {
    const ch = upto[i];
    if (ch === '"') return null;
    if (!(ch in SIGIL_KIND)) continue;
    if (i > 0 && !/\s/.test(upto[i - 1])) continue;
    const query = upto.slice(i + 1);
    const kind = SIGIL_KIND[ch];
    if (/^\s/.test(query)) return null;
    if (/\s/.test(query) && !hasPrefix(kind, query)) return null;
    // Section, label and assignee need a letter first, like the parser (`+1`, `/2` stay text).
    if (query && !/^\p{L}/u.test(query)) return null;
    return { kind, sigil: ch, start: i, query };
  }
  return null;
}

const fold = (s: string) => s.toLocaleLowerCase("en");

/** Rank candidates: exact, then prefix, then word-prefix, then substring. Max `limit`. */
export function rankCandidates(cands: Candidate[], query: string, limit = 8): Candidate[] {
  const q = fold(query.trim());
  if (!q) return cands.slice(0, limit);
  const scored: [number, Candidate][] = [];
  for (const c of cands) {
    const names = [c.label, c.insert, ...(c.aliases ?? [])].map(fold);
    let best = Infinity;
    for (const n of names) {
      if (n === q) best = Math.min(best, 0);
      else if (n.startsWith(q)) best = Math.min(best, 1);
      else if (n.split(/[\s_.-]+/).some((w) => w.startsWith(q))) best = Math.min(best, 2);
      else if (n.includes(q)) best = Math.min(best, 3);
    }
    if (best < Infinity) scored.push([best, c]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label, "en"))
    .slice(0, limit)
    .map(([, c]) => c);
}

/** True when some candidate's label/insert/alias starts with `query` (case-insensitive). */
export function anyPrefix(cands: Candidate[], query: string): boolean {
  const q = fold(query);
  return cands.some((c) => [c.label, c.insert, ...(c.aliases ?? [])].some((n) => fold(n).startsWith(q)));
}

/**
 * Replace the trigger (sigil + query, plus the rest of a word the caret is inside) with the
 * chosen candidate. Returns the new text and caret position.
 */
export function applyCandidate(text: string, caret: number, t: Trigger, c: Candidate): { text: string; caret: number } {
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const token = `${t.sigil}${c.insert}`;
  const after = text.slice(end).replace(/^\s*/, "");
  const next = `${text.slice(0, t.start)}${token} ${after}`;
  return { text: next, caret: t.start + token.length + 1 };
}
