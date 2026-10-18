import { describe, expect, it } from "vitest";
import { dedupeRowIds, rangeBetween, stepId } from "./selection";

describe("rangeBetween", () => {
  const ids = ["a", "b", "c", "d"];
  it("selects inclusively in either direction", () => {
    expect(rangeBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(ids, "c", "c")).toEqual(["c"]);
  });
  it("falls back to the target when the anchor left the screen", () => {
    expect(rangeBetween(ids, "zz", "b")).toEqual(["b"]);
    expect(rangeBetween(ids, "a", "zz")).toEqual([]);
  });
});

describe("dedupeRowIds / stepId (a multi-label task repeats under Label grouping)", () => {
  const rows = ["a", "b", "a", "c"];
  it("keeps the first occurrence", () => {
    expect(dedupeRowIds(rows)).toEqual(["a", "b", "c"]);
  });
  it("j from b reaches c instead of bouncing back to a copy of a", () => {
    expect(stepId(dedupeRowIds(rows), "b", 1)).toBe("c");
    expect(stepId(dedupeRowIds(rows), "c", -1)).toBe("b");
  });
});
