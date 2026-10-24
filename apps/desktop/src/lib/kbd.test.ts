/// <reference types="node" />
/**
 * Keycap guard (programme Slice A, item 5). One borderless tonal cap, one size, text-micro.
 * The `inverted` variant stays for use on filled surfaces.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("../components/shared/Kbd.tsx", import.meta.url)), "utf8");

describe("keycap", () => {
  it("is one size and uses the micro type step", () => {
    expect(SRC).toContain("h-5 min-w-5");
    expect(SRC).toContain("rounded-sm");
    expect(SRC).toContain("px-1.5");
    expect(SRC).toContain("text-micro");
  });

  it("has no border and no arbitrary type size", () => {
    expect(SRC).not.toMatch(/\bborder\b(?!-)/);
    expect(SRC).not.toMatch(/text-\[/);
  });

  it("keeps cap and 'then' text AA on a selected palette row (axe color-contrast)", () => {
    expect(SRC).not.toContain("text-muted-foreground/60");
    expect(SRC).toContain("bg-surface-2 text-foreground");
  });

  it("keeps the inverted variant", () => {
    expect(SRC).toContain("inverted");
    expect(SRC).toContain("border-white/25 bg-white/15 text-current");
  });
});
