import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { droppedFields, inverseOf, toPreview, toWire } from "./patch";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    type: "task",
    title: "T",
    tags: ["a"],
    owner: "lennard",
    created: null,
    updated: null,
    status: "open",
    priority: "high",
    claimed_by: null,
    project: null,
    blocks: [],
    blocked_by: [],
    ...over,
  };
}

describe("toWire", () => {
  it("turns null on clearable keys into the core's empty-string clear", () => {
    expect(toWire({ due: null, section: null, project: "", order: null })).toEqual({ due: "", section: "", project: "", order: "" });
  });
  it("drops null on non-clearable keys and keeps values", () => {
    expect(toWire({ title: "x", priority: undefined, due: "2026-10-16" })).toEqual({ title: "x", due: "2026-10-16" });
  });
});

describe("toPreview", () => {
  it("shows an empty-string clear as unset", () => {
    expect(toPreview({ due: "", title: "x" })).toEqual({ due: null, title: "x" });
  });
});

describe("inverseOf", () => {
  it("restores unset fields with an empty string, set fields with their value", () => {
    const before = task({ due: "2026-10-15", section: undefined });
    expect(inverseOf(before, { due: null, section: "api", tags: "+b" })).toEqual({ due: "2026-10-15", section: "", tags: "=a" });
  });
  it("restores priority and skips status", () => {
    expect(inverseOf(task({ priority: null }), { priority: "urgent", status: "open" })).toEqual({ priority: "normal" });
  });
});

describe("droppedFields", () => {
  it("reports set v2 fields the response lacks, never a clear", () => {
    expect(droppedFields({ due: "2026-10-16", section: "" }, task())).toEqual(["due"]);
    expect(droppedFields({ due: "2026-10-16" }, task({ due: "2026-10-16" }))).toEqual([]);
  });
});
