import { describe, expect, it } from "vitest";
import { rangeBetween } from "./selection";

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
