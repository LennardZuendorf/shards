import { describe, expect, it } from "vitest";
import { initials, withProjectColors } from "./color";

describe("withProjectColors", () => {
  it("keeps explicit colors and gives the rest distinct palette colors", () => {
    const out = withProjectColors([
      { id: "n-13AB", color: null },
      { id: "n-1EW2", color: null },
      { id: "n-1HG1", color: "blue" },
      { id: "n-1JD7" },
    ]);
    expect(out[2].color).toBe("blue");
    const colors = out.map((p) => p.color);
    expect(new Set(colors).size).toBe(4);
    expect(colors.every(Boolean)).toBe(true);
  });

  it("is stable for the same input", () => {
    type P = { id: string; color?: string | null };
    const a = withProjectColors<P>([{ id: "n-A" }, { id: "n-B" }]);
    const b = withProjectColors<P>([{ id: "n-B" }, { id: "n-A" }]);
    expect(a.find((p) => p.id === "n-A")?.color).toBe(b.find((p) => p.id === "n-A")?.color);
  });
});

describe("initials", () => {
  it("uses one letter for one word and two for two words", () => {
    expect(initials("Lennard")).toBe("L");
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("claude-code")).toBe("CC");
  });
});
