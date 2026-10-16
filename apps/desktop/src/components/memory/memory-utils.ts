/**
 * Pure memory helpers: expiry state, freshness, the recall score breakdown (mirrors
 * `recall_score` in src/domain/memories.rs), filtering and the supersession chain.
 */
import type { Memory } from "@/lib/types";

export const DEFAULT_IMPORTANCE = 3;
const IMPORTANCE_INTERCEPT = 0.6;
const IMPORTANCE_SLOPE = 0.1;
const RECENCY_FLOOR = 0.35;
const RECENCY_SPAN = 0.65;
const HALF_LIFE_DAYS = 90;
const DAY_MS = 86_400_000;

export const effectiveImportance = (m: Pick<Memory, "importance">): number =>
  typeof m.importance === "number" ? m.importance : DEFAULT_IMPORTANCE;

export const importanceWeight = (importance: number): number => IMPORTANCE_INTERCEPT + IMPORTANCE_SLOPE * importance;

/** `0.35 + 0.65 · 0.5^(age/90)`; 1 when decay is off. */
export function recencyWeight(ageDays: number, decay = true): number {
  if (!decay) return 1;
  return RECENCY_FLOOR + RECENCY_SPAN * Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

export function ageDays(updated: string | null | undefined, now: Date = new Date()): number {
  if (!updated) return 0;
  const t = Date.parse(updated);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / DAY_MS);
}

export interface RecallBreakdown {
  final: number;
  /** Raw search match score backed out of the final score. */
  match: number;
  importance: number;
  importanceWeight: number;
  recencyWeight: number;
  ageDays: number;
}

/** Back out the components of a recall score: `final = match × w(imp) × r(age)`. */
export function recallBreakdown(
  final: number,
  importance: number | null | undefined,
  updated: string | null | undefined,
  opts: { now?: Date; decay?: boolean } = {},
): RecallBreakdown {
  const imp = typeof importance === "number" ? importance : DEFAULT_IMPORTANCE;
  const age = ageDays(updated, opts.now);
  const w = importanceWeight(imp);
  const r = recencyWeight(age, opts.decay ?? true);
  return { final, match: w * r > 0 ? final / (w * r) : 0, importance: imp, importanceWeight: w, recencyWeight: r, ageDays: age };
}

/* ------------------------------------------------------------------ expiry */

export type ExpiryState = "none" | "future" | "soon" | "expired";

/** none / future (> 7 d) / soon (≤ 7 d) / expired (`expires <= now`). */
export function expiryState(expires: string | null | undefined, now: Date = new Date()): ExpiryState {
  if (!expires) return "none";
  const t = Date.parse(expires);
  if (Number.isNaN(t)) return "none";
  const diff = t - now.getTime();
  if (diff <= 0) return "expired";
  if (diff <= 7 * DAY_MS) return "soon";
  return "future";
}

export const isSuperseded = (m: Pick<Memory, "superseded_by">) => !!m.superseded_by && m.superseded_by.trim() !== "";

/** Would recall return this memory (ignoring the query)? */
export function recallEligibility(m: Memory, now: Date = new Date()): { ok: boolean; reason?: string } {
  if (isSuperseded(m)) return { ok: false, reason: "superseded" };
  if (expiryState(m.expires, now) === "expired") return { ok: false, reason: "expired" };
  return { ok: true };
}

/* ----------------------------------------------------------------- filters */

export interface MemoryFilters {
  text?: string;
  kinds?: string[];
  scope?: string | null;
  project?: string | null;
  owner?: string | null;
  minImportance?: number;
  includeExpired?: boolean;
  includeSuperseded?: boolean;
}

export interface FilterResult {
  items: Memory[];
  /** Matches hidden only because of the expired / superseded toggles. */
  hiddenExpired: number;
  hiddenSuperseded: number;
}

function matchesText(m: Memory, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  const hay = [m.title, m.id, m.source ?? "", m.owner ?? "", m.kind, ...(m.tags ?? []), m.body ?? ""].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function filterMemories(list: Memory[], f: MemoryFilters, now: Date = new Date()): FilterResult {
  let hiddenExpired = 0;
  let hiddenSuperseded = 0;
  const items: Memory[] = [];
  for (const m of list) {
    if (f.kinds?.length && !f.kinds.includes(m.kind)) continue;
    if (f.scope && m.scope !== f.scope) continue;
    if (f.project && m.project !== f.project) continue;
    if (f.owner && m.owner !== f.owner) continue;
    if (f.minImportance && effectiveImportance(m) < f.minImportance) continue;
    if (f.text && !matchesText(m, f.text)) continue;
    const sup = isSuperseded(m);
    const exp = expiryState(m.expires, now) === "expired";
    if (sup && !f.includeSuperseded) {
      hiddenSuperseded++;
      continue;
    }
    if (exp && !f.includeExpired) {
      hiddenExpired++;
      continue;
    }
    items.push(m);
  }
  return { items, hiddenExpired, hiddenSuperseded };
}

/** Count of active filters (for the "Clear filters" affordance). */
export function activeFilterCount(f: MemoryFilters): number {
  return [f.text?.trim(), f.kinds?.length, f.scope, f.project, f.owner, f.minImportance && f.minImportance > 1].filter(Boolean).length;
}

/* ------------------------------------------------------------ supersession */

/**
 * The supersession chain through `id`, oldest first: predecessors (memories whose
 * `superseded_by` points forward) then successors. Cycles and missing links stop the walk.
 */
export function supersessionChain(id: string, list: Memory[]): { chain: Memory[]; broken: string | null } {
  const byId = new Map(list.map((m) => [m.id, m]));
  const pred = new Map<string, Memory>();
  for (const m of list) if (m.superseded_by) pred.set(m.superseded_by, m);
  const start = byId.get(id);
  if (!start) return { chain: [], broken: null };
  const seen = new Set([id]);
  const before: Memory[] = [];
  let cur = pred.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    before.unshift(cur);
    cur = pred.get(cur.id);
  }
  const after: Memory[] = [];
  let broken: string | null = null;
  let next = start.superseded_by;
  while (next && !seen.has(next)) {
    const m = byId.get(next);
    if (!m) {
      broken = next;
      break;
    }
    seen.add(next);
    after.push(m);
    next = m.superseded_by;
  }
  return { chain: [...before, start, ...after], broken };
}

/* ------------------------------------------------------- why-recalled text */

/** Human explanation for a recall hit: which query terms matched where, and the weights. */
export function whyRecalled(query: string, m: Partial<Memory> & { snippet?: string }, b: RecallBreakdown): string[] {
  const out: string[] = [];
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
  const inTitle = terms.filter((t) => (m.title ?? "").toLowerCase().includes(t));
  const inTags = terms.filter((t) => (m.tags ?? []).some((x) => x.toLowerCase().includes(t)));
  const inBody = terms.filter((t) => ((m.body ?? "") + " " + (m.snippet ?? "")).toLowerCase().includes(t) && !inTitle.includes(t));
  if (inTitle.length) out.push(`Title matches “${inTitle.join("”, “")}”`);
  if (inTags.length) out.push(`Tag matches “${inTags.join("”, “")}”`);
  if (inBody.length) out.push(`Body matches “${inBody.join("”, “")}”`);
  if (!inTitle.length && !inTags.length && !inBody.length) out.push("Matched by the search engine (stemmed or semantic match)");
  if (b.importanceWeight > 1.001) out.push(`High importance (${b.importance}) boosts it ×${b.importanceWeight.toFixed(2)}`);
  else if (b.importanceWeight < 0.999) out.push(`Importance ${b.importance} weighs it ×${b.importanceWeight.toFixed(2)}`);
  if (b.recencyWeight < 0.999) {
    const age = Math.round(b.ageDays);
    out.push(age < 1 ? "Updated today: almost no recency decay" : `Updated ${age}d ago: recency ×${b.recencyWeight.toFixed(2)}`);
  }
  return out;
}

export const formatScore = (n: number) => (Number.isFinite(n) ? n.toFixed(n >= 10 ? 1 : 3) : "–");
