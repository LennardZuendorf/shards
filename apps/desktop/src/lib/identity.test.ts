import { describe, expect, it } from "vitest";
import { agentArt, projectShape } from "./identity";

describe("identity presentation", () => {
  it("uses supplied art only for known agents and never guesses a person", () => {
    expect(agentArt("claude-code")).toContain("claude-code.webp");
    expect(agentArt("flights-agent")).toContain("flights-agent.webp");
    expect(agentArt("ops-agent")).toContain("ops-agent.webp");
    expect(agentArt("new-agent")).toBeNull();
    expect(agentArt("lennard")).toBeNull();
  });
  it("keeps project shapes stable across ordering and Unicode ids", () => {
    const ids = ["n-launch", "n-home", "n-åäö", "n-東京"];
    const first = new Map(ids.map(id => [id, projectShape(id)]));
    expect(ids.toReversed().map(id => [id, projectShape(id)])).toEqual(ids.toReversed().map(id => [id, first.get(id)]));
    expect(ids.every(id => ["diamond", "square", "ring", "triangle"].includes(projectShape(id)))).toBe(true);
  });
  it.each(["constructor", "toString", "__proto__"])("uses the unknown-agent fallback for inherited property name %s", (id) => {
    expect(agentArt(id)).toBeNull();
  });
});
