/**
 * Quick-add grammar (DECISIONS: `#project`, `/section`, `@label`, `p1`–`p4`, `+assignee`,
 * natural dates via chrono, `every …` / `every! …`, `{deadline}`).
 *
 * Extraction order matters: `{deadline}` → `every…` → `#/@/+/p1` → chrono on what is left, so
 * chrono never eats "2 weeks" out of "every 2 weeks" or "friday" out of "{friday}".
 * Every consumed span is masked with spaces so indices into the original text stay valid.
 */
import { casual } from "chrono-node/en";
import { formatDue } from "../dates";
import { firstOccurrence, formatRRule, parseRRule, sortWeekdays, type RRule, type Weekday } from "../recur";
import type { Priority, RecurFrom } from "../types";

export type TokenKind = "project" | "section" | "label" | "priority" | "owner" | "due" | "recur" | "deadline";

export interface Token {
  kind: TokenKind;
  /** Inclusive start / exclusive end into the original input. */
  start: number;
  end: number;
  /** The raw text of the span. */
  text: string;
  /** The parsed value (project name, label, `urgent`, `2026-10-16T17:00`, RRULE …). */
  value: string;
}

export interface ParsedTask {
  title: string;
  project: string | null;
  section: string | null;
  labels: string[];
  priority: Priority | null;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (floating local). */
  due: string | null;
  /** RRULE subset string. */
  recur: string | null;
  recur_from: RecurFrom | null;
  /** `YYYY-MM-DD`. */
  deadline: string | null;
  owner: string | null;
  /**
   * Set when an `every …` phrase is not in the supported repeat grammar ("every last day").
   * The phrase stays in the title, sets no rule and no date, and the form shows this text.
   */
  warning: string | null;
  /** Spans in source order. */
  tokens: Token[];
}

/** The sigil kinds whose values can be names (and so can contain spaces). */
export type NameKind = "project" | "section" | "label" | "owner";

export interface ParseOptions {
  /** Reference "now" (tests pass a fixed date). */
  now?: Date;
  /**
   * Known names per sigil (project titles, section names, labels, member names). After its
   * sigil, the longest known name followed by a token boundary is taken whole, so
   * `#Shards Launch` is one project, not `#Shards` plus "Launch" in the title. The token value
   * is the known spelling.
   */
  known?: Partial<Record<NameKind, readonly string[]>>;
}

const PRIORITY_BY_DIGIT: Record<string, Priority> = { "1": "urgent", "2": "high", "3": "normal", "4": "low" };

const DAY_ALIASES: [RegExp, Weekday][] = [
  [/^mo(n(day)?)?$/i, "MO"],
  [/^tu(e(s(day)?)?)?$/i, "TU"],
  [/^we(d(nesday)?)?$/i, "WE"],
  [/^th(u(r(s(day)?)?)?)?$/i, "TH"],
  [/^fr(i(day)?)?$/i, "FR"],
  [/^sa(t(urday)?)?$/i, "SA"],
  [/^su(n(day)?)?$/i, "SU"],
];
const DAY_WORD = "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?";

function weekdayOf(word: string): Weekday | null {
  const w = word.replace(/s$/i, "");
  for (const [re, d] of DAY_ALIASES) if (re.test(w)) return d;
  return null;
}

const UNIT_FREQ: Record<string, RRule["freq"]> = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };

interface RecurMatch {
  rule: RRule;
  length: number;
}

/** Match a recurrence phrase at the start of `rest` (the text right after `every ` / `every! `). */
function matchRecurrence(rest: string): RecurMatch | null {
  let m: RegExpExecArray | null;
  // "month on the 1st" / "month on the 15th"
  if ((m = /^(?:(\d+)\s+months?|month)\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(rest))) {
    const day = Number(m[2]);
    if (day >= 1 && day <= 31) return { rule: { freq: "MONTHLY", interval: Number(m[1] ?? 1), bymonthday: day }, length: m[0].length };
  }
  // "15th" / "1st of the month"
  if ((m = /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?:\s+of\s+(?:the|every)\s+month)?\b/i.exec(rest))) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) return { rule: { freq: "MONTHLY", interval: 1, bymonthday: day }, length: m[0].length };
  }
  // "weekday" / "workday"
  if ((m = /^(?:week|work)days?\b/i.exec(rest))) {
    return { rule: { freq: "WEEKLY", interval: 1, byday: ["MO", "TU", "WE", "TH", "FR"] }, length: m[0].length };
  }
  // "weekend"
  if ((m = /^weekends?\b/i.exec(rest))) {
    return { rule: { freq: "WEEKLY", interval: 1, byday: ["SA", "SU"] }, length: m[0].length };
  }
  // "2 weeks", "3 days"
  if ((m = /^(\d{1,3})\s+(day|week|month|year)s?\b/i.exec(rest))) {
    const n = Number(m[1]);
    if (n >= 1) return { rule: { freq: UNIT_FREQ[m[2].toLowerCase()], interval: n }, length: m[0].length };
  }
  // "other week"
  if ((m = /^other\s+(day|week|month|year)\b/i.exec(rest))) {
    return { rule: { freq: UNIT_FREQ[m[1].toLowerCase()], interval: 2 }, length: m[0].length };
  }
  // "day", "week", "month", "year"
  if ((m = /^(day|week|month|year)\b/i.exec(rest))) {
    return { rule: { freq: UNIT_FREQ[m[1].toLowerCase()], interval: 1 }, length: m[0].length };
  }
  // "mon, wed and fri" / "monday & thursday" / "tue thu"
  const list = new RegExp(`^${DAY_WORD}(?:\\s*(?:,|&|\\band\\b)?\\s*${DAY_WORD})*\\b`, "i");
  if ((m = list.exec(rest))) {
    const days = m[0]
      .split(/[\s,&]+|\band\b/i)
      .map((w) => w.trim())
      .filter(Boolean)
      .map(weekdayOf)
      .filter((d): d is Weekday => d !== null);
    if (days.length) return { rule: { freq: "WEEKLY", interval: 1, byday: sortWeekdays(days) }, length: m[0].length };
  }
  return null;
}

/** Words a repeat phrase is made of; an unsupported `every …` phrase runs while they last. */
const MONTH_WORD = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const REPEAT_WORD = new RegExp(
  `^(?:last|first|second|third|fourth|fifth|next|other|this|the|of|on|at|in|and|every|business|working|day|week|month|year|quarter|weekday|workday|weekend|morning|afternoon|evening|night|hour|minute|end|start|beginning|\\d+(?:st|nd|rd|th)?|${DAY_WORD}|${MONTH_WORD})s?$`,
  "i",
);

/** The end of the run of repeat-vocabulary words starting at `from` (or `from` itself). */
function repeatPhraseEnd(text: string, from: number): number {
  let end = from;
  const re = /\S+/gy;
  let i = from;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m || !REPEAT_WORD.test(m[0])) return end;
    end = i + m[0].length;
    i = end;
  }
}

/** `on the 20th` / `on 20th`: the next date on that day of the month, today included. */
function matchMonthDay(text: string, now: Date): { start: number; end: number; date: Date } | null {
  const m = /(^|\s)(on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th))(?=\s|$|[.,;])/i.exec(text);
  if (!m) return null;
  const day = Number(m[3]);
  if (day < 1 || day > 31) return null;
  for (let k = 0; k < 13; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, day);
    if (d.getDate() !== day) continue; // the month has no such day
    if (k === 0 && day < now.getDate()) continue;
    const start = m.index + m[1].length;
    return { start, end: start + m[2].length, date: d };
  }
  return null;
}

function mask(s: string, start: number, end: number): string {
  return s.slice(0, start) + " ".repeat(end - start) + s.slice(end);
}

/** Token-boundary prefix regex: start of input or whitespace before; whitespace or end after. */
const B_START = "(^|\\s)";
const B_END = "(?=\\s|$)";

export function parseQuickAdd(input: string, opts: ParseOptions = {}): ParsedTask {
  const now = opts.now ?? new Date();
  let masked = input;
  const tokens: Token[] = [];
  const out: ParsedTask = {
    title: "",
    project: null,
    section: null,
    labels: [],
    priority: null,
    due: null,
    recur: null,
    recur_from: null,
    deadline: null,
    owner: null,
    warning: null,
    tokens,
  };

  const take = (kind: TokenKind, start: number, end: number, value: string) => {
    tokens.push({ kind, start, end, text: input.slice(start, end), value });
    masked = mask(masked, start, end);
  };

  // 1. {deadline}
  for (const m of [...masked.matchAll(/\{([^{}]+)\}/g)]) {
    const res = casual.parse(m[1], now, { forwardDate: true })[0];
    if (!res) continue;
    const key = formatDue(res.start.date(), false);
    out.deadline = key;
    take("deadline", m.index, m.index + m[0].length, key);
  }

  // 2. every / every! recurrence (first match wins). A phrase outside the supported grammar
  //    ("every last day") is hidden from chrono, so "last day" never becomes a one-off date
  //    in the past; it stays in the title and the form warns. "every invoice" is just words.
  const everyRe = /(^|\s)(every(!?))\s+/gi;
  const unsupported: [number, number][] = [];
  for (const m of [...masked.matchAll(everyRe)]) {
    const start = m.index + m[1].length;
    const restStart = m.index + m[0].length;
    const hit = matchRecurrence(masked.slice(restStart));
    if (!hit) {
      const chronoEnd = casual
        .parse(masked.slice(restStart), now, { forwardDate: true })
        .filter((r) => r.index === 0)
        .reduce((e, r) => Math.max(e, restStart + r.text.length), restStart);
      const end = Math.max(chronoEnd, repeatPhraseEnd(masked, restStart));
      if (end > restStart) unsupported.push([start, end]);
      continue;
    }
    const end = restStart + hit.length;
    out.recur = formatRRule(hit.rule);
    out.recur_from = m[3] === "!" ? "completion" : "due";
    take("recur", start, end, out.recur);
    break;
  }
  if (unsupported.length) {
    const [s, e] = unsupported[0];
    out.warning = `Repeat not understood: “${input.slice(s, e)}”`;
  }

  // 3. sigils (must sit on token boundaries so URLs, emails and "#123" stay in the title).
  //    Per sigil: a quoted name (`#"Q4 Planning"`), else the longest known name, else one word.
  const sigil = (re: RegExp, fn: (m: RegExpExecArray, start: number, end: number) => void) => {
    for (const m of [...masked.matchAll(re)]) {
      const start = m.index + m[1].length;
      fn(m as RegExpExecArray, start, m.index + m[0].length);
    }
  };
  const named = (char: string, kind: NameKind, fn: (value: string, start: number, end: number) => void) => {
    const known = [...(opts.known?.[kind] ?? [])].filter((n) => n.trim()).sort((a, b) => b.length - a.length);
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] !== char || (i > 0 && !/\s/.test(masked[i - 1]))) continue;
      const rest = masked.slice(i + 1);
      let value: string | null = null;
      let len = 0;
      const q = /^"([^"]*\S[^"]*)"(?=\s|$)/u.exec(rest);
      if (q) {
        const name = q[1].trim();
        value = known.find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
        len = q[0].length;
      } else {
        const lower = rest.toLowerCase();
        const hit = known.find((k) => lower.startsWith(k.toLowerCase()) && (rest.length === k.length || /\s/.test(rest[k.length])));
        if (hit) {
          value = hit;
          len = hit.length;
        } else {
          const w = /^(\p{L}[\p{L}\p{N}_.-]*)(?=\s|$)/u.exec(rest);
          if (w) {
            value = w[1];
            len = w[0].length;
          }
        }
      }
      if (value === null) continue;
      fn(value, i, i + 1 + len);
      i += len;
    }
  };
  named("#", "project", (v, s, e) => {
    out.project = v;
    take("project", s, e, v);
  });
  named("/", "section", (v, s, e) => {
    out.section = v;
    take("section", s, e, v);
  });
  named("@", "label", (v, s, e) => {
    if (!out.labels.includes(v)) out.labels.push(v);
    take("label", s, e, v);
  });
  named("+", "owner", (v, s, e) => {
    out.owner = v;
    take("owner", s, e, v);
  });
  sigil(new RegExp(`${B_START}[pP]([1-4])${B_END}`, "g"), (m, s, e) => {
    out.priority = PRIORITY_BY_DIGIT[m[2]];
    take("priority", s, e, out.priority);
  });

  // 4. natural-language due date on the remaining text (unsupported repeat phrases hidden)
  const rule = parseRRule(out.recur);
  let dateText = masked;
  for (const [s, e] of unsupported) dateText = mask(dateText, s, e);
  const results = casual.parse(dateText, now, { forwardDate: true });
  const res = results.find(
    (r) => r.start.isCertain("day") || r.start.isCertain("weekday") || r.start.isCertain("hour"),
  );
  if (res) {
    const hasTime = res.start.isCertain("hour");
    let d = res.start.date();
    const dayKnown = res.start.isCertain("day") || res.start.isCertain("weekday");
    if (!dayKnown && rule) {
      // "every mon at 9am": the recurrence decides the day, chrono only the time.
      // If that slot already passed today, start from tomorrow.
      const at = (from: Date) => {
        const f = firstOccurrence(rule, from);
        return new Date(f.getFullYear(), f.getMonth(), f.getDate(), d.getHours(), d.getMinutes());
      };
      let cand = at(now);
      if (hasTime && cand.getTime() < now.getTime()) {
        cand = at(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      }
      d = cand;
    }
    out.due = formatDue(d, hasTime);
    take("due", res.index, res.index + res.text.length, out.due);
  } else if (rule) {
    out.due = formatDue(firstOccurrence(rule, now), false);
  } else {
    // chrono reads no bare day of the month: "on the 20th".
    const md = matchMonthDay(dateText, now);
    if (md) {
      out.due = formatDue(md.date, false);
      take("due", md.start, md.end, out.due);
    }
  }

  tokens.sort((a, b) => a.start - b.start);
  out.title = masked.replace(/\s+/g, " ").trim();
  return out;
}

/** Split the input into plain and token segments for inline highlighting. */
export function segments(input: string, tokens: Token[]): { text: string; token?: Token }[] {
  const out: { text: string; token?: Token }[] = [];
  let i = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    if (t.start < i) continue;
    if (t.start > i) out.push({ text: input.slice(i, t.start) });
    out.push({ text: input.slice(t.start, t.end), token: t });
    i = t.end;
  }
  if (i < input.length) out.push({ text: input.slice(i) });
  return out;
}
