import { describe, expect, it } from "vitest";
import type { Memory } from "@/lib/types";
import {
  activeFilterCount,
  expiryState,
  filterMemories,
  recallBreakdown,
  recallEligibility,
  recencyWeight,
  supersessionChain,
  whyRecalled,
} from "./memory-utils";

const NOW = new Date("2026-10-15T12:00:00Z");

function mem(over: Partial<Memory> & { id: string }): Memory {
  return {
    type: "memory",
    title: over.id,
    tags: [],
    owner: "claude-code",
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-15T12:00:00Z",
    kind: "fact",
    scope: "shared",
    project: null,
    importance: 3,
    source: null,
    expires: null,
    superseded_by: null,
    ...over,
  };
}

describe("recall score breakdown", () => {
  it("mirrors the core formula at age 0 and one half-life", () => {
    expect(recencyWeight(0)).toBeCloseTo(1);
    expect(recencyWeight(90)).toBeCloseTo(0.675);
    expect(recencyWeight(90, false)).toBe(1);
  });

  it("backs out the match score exactly", () => {
    // match 0.8, importance 5 → w 1.1, age 90d → r 0.675
    const final = 0.8 * 1.1 * 0.675;
    const b = recallBreakdown(final, 5, "2026-07-17T12:00:00Z", { now: NOW });
    expect(b.ageDays).toBeCloseTo(90);
    expect(b.importanceWeight).toBeCloseTo(1.1);
    expect(b.match).toBeCloseTo(0.8);
  });

  it("uses importance 3 when null and no decay when disabled", () => {
    const b = recallBreakdown(0.9, null, "2020-01-01T00:00:00Z", { now: NOW, decay: false });
    expect(b.importance).toBe(3);
    expect(b.recencyWeight).toBe(1);
    expect(b.match).toBeCloseTo(1);
  });

  it("explains which terms matched where", () => {
    const b = recallBreakdown(0.7, 5, NOW.toISOString(), { now: NOW });
    const why = whyRecalled("watcher debounce", { title: "Watcher debounce is 250ms", tags: [], snippet: "" }, b);
    expect(why[0]).toContain("watcher");
    expect(why.some((w) => w.includes("High importance"))).toBe(true);
  });
});

describe("expiry", () => {
  it("classifies none / future / soon / expired", () => {
    expect(expiryState(null, NOW)).toBe("none");
    expect(expiryState("2026-12-01T00:00:00Z", NOW)).toBe("future");
    expect(expiryState("2026-10-18T00:00:00Z", NOW)).toBe("soon");
    expect(expiryState("2026-10-15T12:00:00Z", NOW)).toBe("expired");
    expect(expiryState("garbage", NOW)).toBe("none");
  });

  it("reports recall eligibility", () => {
    expect(recallEligibility(mem({ id: "m-1" }), NOW).ok).toBe(true);
    expect(recallEligibility(mem({ id: "m-1", superseded_by: "m-2" }), NOW).reason).toBe("superseded");
    expect(recallEligibility(mem({ id: "m-1", expires: "2026-01-01T00:00:00Z" }), NOW).reason).toBe("expired");
  });
});

describe("filterMemories", () => {
  const list = [
    mem({ id: "m-a", kind: "fact", owner: "claude-code", importance: 5, title: "Use pnpm" }),
    mem({ id: "m-b", kind: "preference", owner: "lennard", importance: 2, project: "n-p" }),
    mem({ id: "m-c", expires: "2026-01-01T00:00:00Z" }),
    mem({ id: "m-d", superseded_by: "m-a" }),
  ];

  it("hides expired and superseded by default and counts them", () => {
    const r = filterMemories(list, {}, NOW);
    expect(r.items.map((m) => m.id)).toEqual(["m-a", "m-b"]);
    expect(r.hiddenExpired).toBe(1);
    expect(r.hiddenSuperseded).toBe(1);
  });

  it("applies facets and text", () => {
    expect(filterMemories(list, { kinds: ["preference"] }, NOW).items.map((m) => m.id)).toEqual(["m-b"]);
    expect(filterMemories(list, { minImportance: 4 }, NOW).items.map((m) => m.id)).toEqual(["m-a"]);
    expect(filterMemories(list, { project: "n-p" }, NOW).items.map((m) => m.id)).toEqual(["m-b"]);
    expect(filterMemories(list, { text: "pnpm" }, NOW).items.map((m) => m.id)).toEqual(["m-a"]);
    expect(filterMemories(list, { includeExpired: true, includeSuperseded: true }, NOW).items).toHaveLength(4);
    expect(activeFilterCount({ text: " ", kinds: [], minImportance: 1 })).toBe(0);
    expect(activeFilterCount({ text: "x", owner: "a" })).toBe(2);
  });
});

describe("supersessionChain", () => {
  it("walks predecessors and successors, oldest first", () => {
    const list = [mem({ id: "m-1", superseded_by: "m-2" }), mem({ id: "m-2", superseded_by: "m-3" }), mem({ id: "m-3" })];
    expect(supersessionChain("m-2", list).chain.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("flags a broken forward link and survives cycles", () => {
    expect(supersessionChain("m-1", [mem({ id: "m-1", superseded_by: "m-x" })]).broken).toBe("m-x");
    const cyc = [mem({ id: "m-1", superseded_by: "m-2" }), mem({ id: "m-2", superseded_by: "m-1" })];
    expect(supersessionChain("m-1", cyc).chain.length).toBeLessThanOrEqual(2);
  });
});
