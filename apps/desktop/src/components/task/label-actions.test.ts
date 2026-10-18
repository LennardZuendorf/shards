import { describe, expect, it } from "vitest";
import { cleanLabel, renameSpec } from "./label-actions";

describe("label rename", () => {
  it("swaps the tag, and undo swaps it back", () => {
    expect(renameSpec({ tags: ["lable", "x"] }, "lable", "label")).toEqual({ spec: "-lable,+label", undo: "-label,+lable" });
  });

  it("merges into a label the task already has, and undo keeps that label", () => {
    expect(renameSpec({ tags: ["lable", "label"] }, "lable", "label")).toEqual({ spec: "-lable", undo: "+lable" });
  });

  it("cleans a typed name like quick add does", () => {
    expect(cleanLabel("  @needs input ")).toBe("needs-input");
  });
});
