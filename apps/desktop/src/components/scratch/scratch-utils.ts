/** Pure scratchpad helpers: checklist parsing/toggling, liveness, sizes. */

export interface ChecklistItem {
  /** 0-based line index in the body. */
  line: number;
  done: boolean;
  text: string;
}

export interface Checklist {
  items: ChecklistItem[];
  done: number;
  total: number;
}

const CHECK_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s?)(.*)$/;

/** `- [ ]` / `- [x]` lines (any bullet, any indent), skipping fenced code. */
export function parseChecklist(body: string | null | undefined): Checklist {
  const items: ChecklistItem[] = [];
  let fence = false;
  (body ?? "").split("\n").forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const m = CHECK_RE.exec(raw);
    if (m) items.push({ line, done: m[2] !== " ", text: m[4].trim() });
  });
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

/** Flip the checkbox on `line`; returns the body unchanged when that line is not a checkbox. */
export function toggleChecklistLine(body: string, line: number): string {
  const lines = body.split("\n");
  const m = CHECK_RE.exec(lines[line] ?? "");
  if (!m) return body;
  lines[line] = `${m[1]}${m[2] === " " ? "x" : " "}${m[3]}${m[4]}`;
  return lines.join("\n");
}

export type Liveness = "live" | "active" | "idle" | "stale" | "dormant";

/**
 * live < 2 min ("writing now"), active < 30 min, idle < 24 h, dormant < 7 d, stale ≥ 7 d.
 * Only a write in the last two minutes claims an agent is writing right now.
 */
export function liveness(updated: string | null | undefined, now: Date = new Date()): Liveness {
  const t = updated ? Date.parse(updated) : NaN;
  if (Number.isNaN(t)) return "dormant";
  const min = (now.getTime() - t) / 60_000;
  if (min < 2) return "live";
  if (min < 30) return "active";
  if (min < 24 * 60) return "idle";
  if (min < 7 * 24 * 60) return "dormant";
  return "stale";
}

/** UTF-8 byte length (what the file on disk weighs). */
export const byteLength = (s: string | null | undefined): number => new TextEncoder().encode(s ?? "").length;

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** First non-empty, non-heading lines for a card preview (markdown markers stripped). */
export function previewText(body: string | null | undefined, maxLines = 3): string {
  const out: string[] = [];
  for (const raw of (body ?? "").split("\n")) {
    const l = raw.trim();
    if (!l || /^(```|~~~|---)/.test(l)) continue;
    out.push(l.replace(/^#+\s*/, "").replace(/^[-*+]\s+(\[[ xX]\]\s*)?/, "• "));
    if (out.length >= maxLines) break;
  }
  return out.join("\n");
}

/** Composite key used in routes/detail ids: `agent/name`. */
export const scratchKey = (agent: string, name: string) => `${agent}/${name}`;
export function parseScratchKey(key: string): { agent: string; name: string } | null {
  const i = key.indexOf("/");
  if (i <= 0 || i === key.length - 1) return null;
  return { agent: key.slice(0, i), name: key.slice(i + 1) };
}
