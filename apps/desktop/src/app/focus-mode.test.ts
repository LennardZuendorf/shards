import { describe, expect, it } from "vitest";
import { canFocus, createFocusModeStore } from "./focus-mode";

describe("Focus mode eligibility", () => {
  it("refuses every entry without a current eligible task view", () => {
    const s = createFocusModeStore();
    s.set(true); expect(s.getSnapshot()).toBe(false);
    s.registerView("/project/a", false);
    s.toggle(); expect(s.getSnapshot()).toBe(false);
    expect(canFocus("project", true)).toBe(false);
    expect(canFocus("notes", false)).toBe(false);
    expect(canFocus("today", false)).toBe(true);
  });
  it("exits for destination changes and boards without changing other preferences", () => {
    const s = createFocusModeStore();
    s.registerView("/project/a", true); s.toggle();
    expect(s.getSnapshot()).toBe(true);
    s.registerView("/project/b", true);
    expect(s.getSnapshot()).toBe(false);
    s.toggle(); s.registerView("/project/b", false);
    expect(s.getSnapshot()).toBe(false);
  });
  it("ignores cleanup from a replaced registration", () => {
    const s = createFocusModeStore();
    const old = s.registerView("/today", true);
    const current = s.registerView("/project/a", true);
    old(); s.toggle(); expect(s.getSnapshot()).toBe(true);
    current(); expect(s.getSnapshot()).toBe(false);
    s.toggle(); expect(s.getSnapshot()).toBe(false);
  });
});
