/// <reference types="node" />
/**
 * Priority tint decision (programme Slice A, item 7). Colour is loud only at the top of the
 * scale: urgent and high tint the checkbox ring, everything else stays neutral.
 */
import { describe, expect, it } from "vitest";
import { priorityTinted } from "./priority";

describe("priorityTinted", () => {
  it("tints urgent and high", () => {
    expect(priorityTinted("urgent")).toBe(true);
    expect(priorityTinted("high")).toBe(true);
  });

  it("leaves normal and low neutral", () => {
    expect(priorityTinted("normal")).toBe(false);
    expect(priorityTinted("low")).toBe(false);
  });

  it("leaves an unset or unknown priority neutral", () => {
    expect(priorityTinted(null)).toBe(false);
    expect(priorityTinted(undefined)).toBe(false);
    expect(priorityTinted("")).toBe(false);
    expect(priorityTinted("p1")).toBe(false);
  });
});
