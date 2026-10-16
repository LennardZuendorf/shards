import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import {
  ORDER_STEP,
  boardStatusOf,
  buildTree,
  compareByDue,
  compareManual,
  descendantCount,
  descriptionPreview,
  flattenTree,
  groupBySection,
  highlight,
  joinBody,
  matchesQuery,
  moveItem,
  openDescendants,
  planIndent,
  planMove,
  planOutdent,
  orderBetween,
  parseComments,
  planReorder,
  splitBody,
} from "./model";

/** A valid task fixture; tests override one field at a time. */
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    tags: [],
    owner: "lennard",
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-01T00:00:00Z",
    status: "open",
    priority: "normal",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

describe("openDescendants", () => {
  it("lists open children and grandchildren, parents first, skipping finished ones", () => {
    const all = [
      task("p"),
      task("c1", { parent: "p" }),
      task("c2", { parent: "p", status: "done" }),
      task("g1", { parent: "c1", status: "claimed" }),
      task("other", { parent: "x" }),
    ];
    expect(openDescendants(all, "p").map((t) => t.id)).toEqual(["c1", "g1"]);
    expect(openDescendants(all, "c2")).toEqual([]);
  });

  it("survives a parent cycle", () => {
    const all = [task("a", { parent: "b" }), task("b", { parent: "a" })];
    expect(openDescendants(all, "a").map((t) => t.id)).toEqual(["b"]);
  });
});

describe("keyboard structure edits", () => {
  const sibs = [task("a", { order: 1024 }), task("b", { order: 2048 }), task("c", { order: 3072 })];

  it("moves a task up and down by a midpoint, and not past the ends", () => {
    expect(planMove(sibs, "b", -1)).toEqual([{ id: "b", order: 0 }]);
    expect(planMove(sibs, "b", 1)).toEqual([{ id: "b", order: 4096 }]);
    expect(planMove(sibs, "a", -1)).toBeNull();
    expect(planMove(sibs, "c", 1)).toBeNull();
  });

  it("indents under the previous sibling, after its last subtask", () => {
    const kids = { a: [task("a1", { order: 5000 })] } as Record<string, Task[]>;
    expect(planIndent(sibs, "b", (id) => kids[id] ?? [])).toEqual({ parent: "a", order: 5000 + ORDER_STEP });
    expect(planIndent(sibs, "a", () => [])).toBeNull();
  });

  it("outdents right after the parent", () => {
    expect(planOutdent(sibs[0], sibs)).toEqual({ order: 1536 });
    expect(planOutdent(sibs[2], sibs)).toEqual({ order: 3072 + ORDER_STEP });
    expect(planOutdent(null, null)).toEqual({ order: null });
  });
});

describe("compareManual", () => {
  it("sorts by order, unset last, then created, then id", () => {
    const rows = [
      task("d", { order: null, created: "2026-10-02T00:00:00Z" }),
      task("c", { order: null, created: "2026-10-01T00:00:00Z" }),
      task("b", { order: 2 }),
      task("a", { order: 1 }),
      task("e", { order: null, created: "2026-10-01T00:00:00Z" }),
    ];
    expect([...rows].sort(compareManual).map((t) => t.id)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("tolerates a missing order key entirely (v1 task)", () => {
    const a = task("a");
    const b = task("b", { order: 5 });
    expect([a, b].sort(compareManual).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("compareByDue", () => {
  it("orders by due, timed before all-day on the same day, undated last, then priority", () => {
    const rows = [
      task("none"),
      task("day", { due: "2026-10-15" }),
      task("timed", { due: "2026-10-15T09:00" }),
      task("early", { due: "2026-10-14" }),
      task("none-urgent", { priority: "urgent" }),
    ];
    expect([...rows].sort(compareByDue).map((t) => t.id)).toEqual(["early", "timed", "day", "none-urgent", "none"]);
  });
});

describe("orderBetween", () => {
  it("returns the midpoint", () => expect(orderBetween(1, 2)).toBe(1.5));
  it("extends past the ends", () => {
    expect(orderBetween(null, 100)).toBe(100 - ORDER_STEP);
    expect(orderBetween(100, undefined)).toBe(100 + ORDER_STEP);
    expect(orderBetween(null, null)).toBe(ORDER_STEP);
  });
  it("reports an exhausted gap", () => {
    expect(orderBetween(1, 1)).toBeNull();
    expect(orderBetween(1, 1 + 1e-9)).toBeNull();
    expect(orderBetween(2, 1)).toBeNull();
  });
});

describe("planReorder", () => {
  const g = [
    { id: "a", order: 1024 },
    { id: "b", order: 2048 },
    { id: "c", order: 3072 },
  ];

  it("writes one midpoint when moving within a fully ordered group", () => {
    expect(planReorder(g, "c", 0)).toEqual([{ id: "c", order: 0 }]);
    expect(planReorder(g, "a", 1)).toEqual([{ id: "a", order: 2560 }]);
    expect(planReorder(g, "a", 2)).toEqual([{ id: "a", order: 3072 + ORDER_STEP }]);
  });

  it("inserts an item coming from another group between neighbours", () => {
    expect(planReorder(g, "x", 1)).toEqual([{ id: "x", order: 1536 }]);
    expect(planReorder([], "x", 0)).toEqual([{ id: "x", order: ORDER_STEP }]);
  });

  it("renumbers when the group has unordered rows, writing only changed rows", () => {
    const mixed = [{ id: "a", order: 1024 }, { id: "b" }, { id: "c" }];
    expect(planReorder(mixed, "c", 1)).toEqual([
      { id: "c", order: 2048 },
      { id: "b", order: 3072 },
    ]);
  });

  it("renumbers when the gap is exhausted", () => {
    const tight = [
      { id: "a", order: 1 },
      { id: "b", order: 1 + 1e-9 },
      { id: "c", order: 5 },
    ];
    const w = planReorder(tight, "c", 1);
    expect(w).toEqual([
      { id: "a", order: 1024 },
      { id: "c", order: 2048 },
      { id: "b", order: 3072 },
    ]);
  });

  it("clamps out-of-range indexes", () => {
    expect(planReorder(g, "x", 99)).toEqual([{ id: "x", order: 3072 + ORDER_STEP }]);
    expect(planReorder(g, "x", -3)).toEqual([{ id: "x", order: 1024 - ORDER_STEP }]);
  });
});

describe("moveItem", () => {
  it("moves without mutating", () => {
    const a = [1, 2, 3, 4];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(a).toEqual([1, 2, 3, 4]);
  });
});

describe("buildTree / flattenTree", () => {
  const rows = [
    task("p", { order: 1 }),
    task("c2", { parent: "p", order: 2 }),
    task("c1", { parent: "p", order: 1 }),
    task("g", { parent: "c1" }),
    task("o", { parent: "missing", order: 0 }),
  ];

  it("nests children under parents present in the list", () => {
    const tree = buildTree(rows);
    expect(tree.map((n) => n.task.id)).toEqual(["o", "p"]);
    const p = tree[1];
    expect(p.children.map((n) => n.task.id)).toEqual(["c1", "c2"]);
    expect(p.children[0].children.map((n) => n.task.id)).toEqual(["g"]);
    expect(descendantCount(p)).toBe(3);
  });

  it("marks orphans whose parent is not in the list", () => {
    const tree = buildTree(rows);
    expect(tree[0].orphanOf).toBe("missing");
    expect(tree[1].orphanOf).toBeNull();
  });

  it("survives a parent cycle", () => {
    const cyc = [task("x", { parent: "y" }), task("y", { parent: "x" })];
    expect(() => buildTree(cyc)).not.toThrow();
  });

  it("flattens depth-first and skips collapsed children", () => {
    const tree = buildTree(rows);
    expect(flattenTree(tree).map((r) => `${r.task.id}:${r.depth}`)).toEqual(["o:0", "p:0", "c1:1", "g:2", "c2:1"]);
    expect(flattenTree(tree, new Set(["c1"])).map((r) => r.task.id)).toEqual(["o", "p", "c1", "c2"]);
  });
});

describe("groupBySection", () => {
  it("puts the unsectioned group first, then known sections, then discovered ones by first task", () => {
    const rows = [
      task("c", { section: "api", order: 3 }),
      task("a", { section: "later", order: 1 }),
      task("d", { section: "zeta", order: 0 }),
      task("b", { order: 2 }),
    ];
    const g = groupBySection(rows, ["design", "api"]);
    expect(g.map((x) => x.section)).toEqual(["", "design", "api", "zeta", "later"]);
    expect(g[0].tasks.map((t) => t.id)).toEqual(["b"]);
    expect(g[1].tasks).toEqual([]);
  });

  it("keeps subtasks in their parent's section", () => {
    const rows = [task("p", { section: "api" }), task("c", { parent: "p", section: "other" })];
    const g = groupBySection(rows);
    expect(g.map((x) => [x.section, x.tasks.map((t) => t.id)])).toEqual([
      ["", []],
      ["api", ["p", "c"]],
    ]);
  });
});

describe("boardStatusOf", () => {
  const open = new Set(["blocker"]);
  it("prefers done, then blocked, then in progress, then open", () => {
    expect(boardStatusOf(task("a", { status: "done", blocked_by: ["blocker"] }), open)).toBe("done");
    expect(boardStatusOf(task("a", { status: "cancelled" }), open)).toBe("done");
    expect(boardStatusOf(task("a", { status: "claimed", blocked_by: ["blocker"] }), open)).toBe("blocked");
    expect(boardStatusOf(task("a", { status: "claimed" }), open)).toBe("progress");
    expect(boardStatusOf(task("a", { blocked_by: ["finished"] }), open)).toBe("open");
  });
});

describe("splitBody / joinBody", () => {
  const body = "Intro line\n\nMore\n\n## Comments\n\n2026-10-15T19:13:58Z — lennard\nHi";

  it("splits at the Comments heading and preserves the tail byte for byte", () => {
    const { description, rest } = splitBody(body);
    expect(description).toBe("Intro line\n\nMore");
    expect(rest).toBe("## Comments\n\n2026-10-15T19:13:58Z — lennard\nHi");
    expect(joinBody("New text", rest)).toBe(`New text\n\n${rest}`);
  });

  it("handles bodies without comments and empty descriptions", () => {
    expect(splitBody("Just text\n")).toEqual({ description: "Just text", rest: "" });
    expect(splitBody(undefined)).toEqual({ description: "", rest: "" });
    expect(joinBody("x", "")).toBe("x\n");
    expect(joinBody("", "")).toBe("");
    expect(joinBody("  ", "## Comments\n")).toBe("## Comments\n");
  });

  it("does not split on a Comments-like heading of another level", () => {
    expect(splitBody("### Comments\nx").rest).toBe("");
  });
});

describe("parseComments", () => {
  it("parses the core's timestamp stamp blocks", () => {
    const rest = "## Comments\n\n2026-10-15T19:13:58Z — lennard\nLooks good.\n\n2026-10-15T19:14:00Z — claude-code\nSecond **c**\nline two";
    expect(parseComments(rest)).toEqual([
      { at: "2026-10-15T19:13:58Z", actor: "lennard", text: "Looks good." },
      { at: "2026-10-15T19:14:00Z", actor: "claude-code", text: "Second **c**\nline two" },
    ]);
  });

  it("keeps unstamped text as an anonymous comment and stops at the next heading", () => {
    const rest = "## Comments\nloose note\n2026-10-15T19:13:58Z\nstamped\n## Outcome\nnot a comment";
    expect(parseComments(rest)).toEqual([
      { at: "", actor: null, text: "loose note" },
      { at: "2026-10-15T19:13:58Z", actor: null, text: "stamped" },
    ]);
  });

  it("returns nothing for an empty tail", () => expect(parseComments("")).toEqual([]));
});

describe("descriptionPreview", () => {
  it("returns the first meaningful line without markdown", () => {
    expect(descriptionPreview("# Heading\n\n- [ ] **Check** the [docs](http://x) and [[Note|alias]]")).toBe(
      "Check the docs and alias",
    );
    expect(descriptionPreview("## Comments\n2026-10-15T19:13:58Z\nhi")).toBe("");
  });
  it("truncates", () => expect(descriptionPreview("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`));
});

describe("highlight / matchesQuery", () => {
  it("marks every case-insensitive occurrence of each term", () => {
    expect(highlight("Review the PR review", "review pr")).toEqual([
      { text: "Review", hit: true },
      { text: " the ", hit: false },
      { text: "PR", hit: true },
      { text: " ", hit: false },
      { text: "review", hit: true },
    ]);
    expect(highlight("abc", "")).toEqual([{ text: "abc", hit: false }]);
  });

  it("requires every term in title, labels, id or section", () => {
    const t = task("t-1", { title: "Ship release", tags: ["backend"], section: "api" });
    expect(matchesQuery(t, "ship backend")).toBe(true);
    expect(matchesQuery(t, "api t-1")).toBe(true);
    expect(matchesQuery(t, "ship frontend")).toBe(false);
  });
});
