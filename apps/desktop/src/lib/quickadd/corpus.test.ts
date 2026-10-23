import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuickAdd, type ParseOptions, type ParsedTask } from "./parse";

const NOW = new Date(2026, 9, 15, 10, 0);

const FIELDS = [
  "title",
  "project",
  "section",
  "labels",
  "priority",
  "due",
  "recur",
  "recur_from",
  "deadline",
  "owner",
  "warning",
] as const;

type Field = (typeof FIELDS)[number];

interface KnownNames {
  project?: string[];
  section?: string[];
  label?: string[];
  owner?: string[];
  projects?: string[];
  sections?: string[];
  labels?: string[];
  owners?: string[];
}

interface CorpusEntry {
  phrase: string;
  expect: Partial<Record<Field, unknown>>;
  todo?: boolean;
  why?: string;
  known?: KnownNames;
}

interface Diff {
  field: Field;
  expected: unknown;
  actual: unknown;
}

const corpus = JSON.parse(
  readFileSync(new URL("./corpus.json", import.meta.url), "utf8"),
) as CorpusEntry[];

function knownFor(entry: CorpusEntry): ParseOptions["known"] {
  const known = entry.known;
  if (!known) return undefined;
  return {
    project: known.projects ?? known.project,
    section: known.sections ?? known.section,
    label: known.labels ?? known.label,
    owner: known.owners ?? known.owner,
  };
}

function diffsFor(entry: CorpusEntry): Diff[] {
  const parsed = parseQuickAdd(entry.phrase, { now: NOW, known: knownFor(entry) });
  const diffs: Diff[] = [];
  for (const field of FIELDS) {
    if (!(field in entry.expect)) continue;
    const expected = entry.expect[field];
    const actual: ParsedTask[Field] = parsed[field];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) diffs.push({ field, expected, actual });
  }
  return diffs;
}

function describeDiffs(phrase: string, diffs: Diff[]): string {
  if (!diffs.length) return `Phrase: ${JSON.stringify(phrase)}\n  all asserted fields matched`;
  return [
    `Phrase: ${JSON.stringify(phrase)}`,
    ...diffs.map((d) => `  ${d.field}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.actual)}`),
  ].join("\n");
}

describe("quick-add corpus", () => {
  it.each(corpus.map((entry) => ({ phrase: entry.phrase, entry })))("$phrase", ({ entry }) => {
    const diffs = diffsFor(entry);
    if (entry.todo) {
      if (diffs.length) console.warn(`known todo\n${describeDiffs(entry.phrase, diffs)}\n  why: ${entry.why ?? "missing why"}`);
      return;
    }
    expect(diffs, describeDiffs(entry.phrase, diffs)).toEqual([]);
  });
});

describe("P1 gate", () => {
  const nonTodo = corpus.filter((entry) => !entry.todo);
  const todoEntries = corpus.filter((entry) => entry.todo);
  const failures = nonTodo
    .map((entry) => ({ entry, diffs: diffsFor(entry) }))
    .filter((failure) => failure.diffs.length > 0);
  const passed = nonTodo.length - failures.length;
  const rate = nonTodo.length === 0 ? 0 : passed / nonTodo.length;

  it("has at least 60 phrases", () => {
    expect(corpus.length, `corpus.json has ${corpus.length} phrases; P1 requires at least 60`).toBeGreaterThanOrEqual(60);
  });

  it("marks at most 3 phrases todo", () => {
    const todoText = todoEntries.map((entry) => `${JSON.stringify(entry.phrase)}: ${entry.why ?? "missing why"}`).join("\n");
    expect(
      todoEntries.length,
      `corpus.json marks ${todoEntries.length} phrases todo; P1 allows at most 3\n${todoText}`,
    ).toBeLessThanOrEqual(3);
  });

  it(`passes at least 95% of non-todo phrases (${passed}/${nonTodo.length} = ${(rate * 100).toFixed(1)}%)`, () => {
    const failureText = failures.length
      ? failures.map((failure) => describeDiffs(failure.entry.phrase, failure.diffs)).join("\n\n")
      : "no failures";
    expect(
      rate,
      `P1 quick-add gate: ${passed}/${nonTodo.length} non-todo phrases passed (${(rate * 100).toFixed(1)}%, need at least 95%)\n\n${failureText}`,
    ).toBeGreaterThanOrEqual(0.95);
  });
});
