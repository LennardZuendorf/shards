import { describe, expect, it } from "vitest";
import { availableTargets, obsidianUrl, pickDefault } from "./open";

describe("obsidianUrl", () => {
  it("percent-encodes like the Rust side", () => {
    expect(obsidianUrl("/a b/ä.md")).toBe("obsidian://open?path=%2Fa%20b%2F%C3%A4.md");
    expect(obsidianUrl("/x/Daily-1_2.~md")).toBe("obsidian://open?path=%2Fx%2FDaily-1_2.~md");
    expect(obsidianUrl("/v/Team & Org/#1?.md")).toBe("obsidian://open?path=%2Fv%2FTeam%20%26%20Org%2F%231%3F.md");
  });
});

describe("targets", () => {
  it("offers Obsidian only for an Obsidian vault and file actions only on desktop", () => {
    expect(availableTargets({ obsidian: true, desktop: true })).toEqual(["obsidian", "default", "reveal"]);
    expect(availableTargets({ obsidian: false, desktop: true })).toEqual(["default", "reveal"]);
    expect(availableTargets({ obsidian: true, desktop: false })).toEqual(["obsidian"]);
    expect(availableTargets({ obsidian: false, desktop: false })).toEqual([]);
  });

  it("falls back from an unavailable preference", () => {
    expect(pickDefault(["obsidian", "default", "reveal"], "default")).toBe("default");
    expect(pickDefault(["default", "reveal"], "obsidian")).toBe("default");
    expect(pickDefault(["obsidian"], "default")).toBe("obsidian");
    expect(pickDefault([], "obsidian")).toBeNull();
  });
});
