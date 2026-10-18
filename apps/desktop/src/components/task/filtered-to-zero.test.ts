import { describe, expect, it } from "vitest";
import { enterFilteredToZero, isFilteredToZero } from "./filtered-to-zero";

describe("filtered-to-zero flag (the empty state owns the only Clear filters button)", () => {
  it("is set while an empty state is mounted and clears when the last one leaves", () => {
    expect(isFilteredToZero()).toBe(false);
    const leaveA = enterFilteredToZero();
    const leaveB = enterFilteredToZero();
    expect(isFilteredToZero()).toBe(true);
    leaveA();
    expect(isFilteredToZero()).toBe(true);
    leaveB();
    expect(isFilteredToZero()).toBe(false);
  });
  it("a leave callback is idempotent", () => {
    const leave = enterFilteredToZero();
    leave();
    leave();
    expect(isFilteredToZero()).toBe(false);
  });
});
