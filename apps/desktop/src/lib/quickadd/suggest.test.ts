import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./parse";
import { activeTrigger, anyPrefix, applyCandidate, rankCandidates, type Candidate } from "./suggest";

const projects: Candidate[] = [
  { key: "n-1", label: "Shards Launch", insert: "Shards Launch" },
  { key: "n-2", label: "Q4 Planning", insert: "Q4 Planning" },
  { key: "n-3", label: "Flights Agent", insert: "Flights Agent" },
];
const has = (_k: string, q: string) => anyPrefix(projects, q);

describe("activeTrigger", () => {
  it("finds the sigil the caret is completing", () => {
    const text = "Review PR #Sha";
    expect(activeTrigger(text, text.length, has)).toEqual({ kind: "project", sigil: "#", start: 10, query: "Sha" });
  });

  it("keeps the trigger across a space while a candidate still matches", () => {
    const text = "Review PR #Shards La";
    expect(activeTrigger(text, text.length, has)?.query).toBe("Shards La");
  });

  it("drops the trigger once nothing matches the spaced query", () => {
    const text = "Review PR #Shards Launch tomorrow";
    expect(activeTrigger(text, text.length, has)).toBeNull();
  });

  it("opens on a bare sigil", () => {
    expect(activeTrigger("Call @", 6, has)?.kind).toBe("label");
  });

  it("ignores sigils inside words, issue numbers and quotes", () => {
    expect(activeTrigger("mail bob@exa", 12, has)).toBeNull();
    expect(activeTrigger("Fix #12", 7, has)).toBeNull();
    expect(activeTrigger('Fix #"Board Pr', 14, has)).toBeNull();
    expect(activeTrigger("C++", 3, has)).toBeNull();
  });
});

describe("rankCandidates", () => {
  it("ranks prefix over word-prefix over substring", () => {
    const r = rankCandidates(projects, "pla");
    expect(r.map((c) => c.label)).toEqual(["Q4 Planning"]);
    expect(rankCandidates(projects, "a").map((c) => c.label)[0]).toBe("Flights Agent");
  });
});

describe("applyCandidate → parse round-trip", () => {
  it("inserts the full name so the parser keeps it whole", () => {
    const text = "Review agent PR #Sha tomorrow";
    const caret = "Review agent PR #Sha".length;
    const t = activeTrigger(text, caret, has);
    expect(t).not.toBeNull();
    const next = applyCandidate(text, caret, t!, projects[0]);
    expect(next.text).toBe("Review agent PR #Shards Launch tomorrow");
    expect(next.text.slice(0, next.caret)).toBe("Review agent PR #Shards Launch ");
    const parsed = parseQuickAdd(next.text, { now: new Date(2026, 9, 15, 10), known: { project: projects.map((p) => p.insert) } });
    expect(parsed.title).toBe("Review agent PR");
    expect(parsed.project).toBe("Shards Launch");
  });
});
