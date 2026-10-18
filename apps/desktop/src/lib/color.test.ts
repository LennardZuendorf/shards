import { describe, expect, it } from "vitest";
import { avatarFill, avatarShape, initials, withProjectColors } from "./color";

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

describe("avatarFill", () => {
  it("is neutral for a human without a member colour: neutral circle fill, foreground text", () => {
    expect(avatarFill({ kind: "human" })).toEqual({
      background: "var(--identity-human-fill)",
      foreground: "var(--foreground)",
    });
    expect(avatarFill({ kind: "human", color: null })).toEqual(avatarFill({ kind: "human" }));
  });

  it("inverts an agent without a member colour: primary fill, primary-foreground glyph", () => {
    expect(avatarFill({ kind: "agent" })).toEqual({
      background: "var(--identity-agent-fill)",
      foreground: "var(--primary-foreground)",
    });
  });

  it("treats an unknown kind as human", () => {
    expect(avatarFill({})).toEqual(avatarFill({ kind: "human" }));
  });

  it("lets [[members]].color override the fill, named or raw CSS", () => {
    expect(avatarFill({ kind: "agent", color: "teal" }).background).toBe("oklch(0.66 0.11 190)");
    expect(avatarFill({ kind: "human", color: "#ff8800" }).background).toBe("#ff8800");
    expect(avatarFill({ kind: "human", color: "#ff8800" }).foreground).toBe("oklch(1 0 0)");
  });

  it("never derives a hue from the id", () => {
    expect(avatarFill({ kind: "agent" })).toEqual(avatarFill({ kind: "agent", color: "" }));
  });
});

describe("avatarShape", () => {
  it("is a circle for humans (and unknown kinds) and a rounded square for agents", () => {
    expect(avatarShape("human")).toBe("rounded-full");
    expect(avatarShape(undefined)).toBe("rounded-full");
    expect(avatarShape("agent")).toBe("rounded-sm");
  });
});
