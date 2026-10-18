import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/types";
import { applyProjectUpdate, PROJECT_COLORS } from "./project-actions";

const base: Project = { id: "n-1", title: "Launch", color: null, sections: ["Plan", "Build", "Ship"], open_count: 2 };

describe("applyProjectUpdate (optimistic host_project_update)", () => {
  it("sets title, color and archived", () => {
    const p = applyProjectUpdate(base, { title: " Launch 2 ", color: "Teal", archived: true });
    expect(p).toMatchObject({ title: "Launch 2", color: "teal", archived: true });
    expect(applyProjectUpdate(p, { color: "" }).color).toBeNull();
  });

  it("renames and removes sections like the host", () => {
    expect(applyProjectUpdate(base, { renames: { Build: "Make" } }).sections).toEqual(["Plan", "Make", "Ship"]);
    expect(applyProjectUpdate(base, { renames: { Build: "" } }).sections).toEqual(["Plan", "Ship"]);
    expect(applyProjectUpdate(base, { renames: { Build: "Plan" } }).sections).toEqual(["Plan", "Ship"]);
    expect(applyProjectUpdate(base, { sections: ["Ship", " Plan ", "Ship"] }).sections).toEqual(["Ship", "Plan"]);
  });

  it("leaves untouched fields alone", () => {
    expect(applyProjectUpdate(base, {})).toEqual(base);
  });
});

describe("PROJECT_COLORS", () => {
  it("offers 10 distinct swatches", () => {
    expect(new Set(PROJECT_COLORS).size).toBe(10);
  });
});
