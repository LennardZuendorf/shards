/// <reference types="node" />
/**
 * Motion defaults (programme Slice A, item 3). A bare Tailwind `transition-*` must speak the
 * spec's `fast` token (120ms, cubic-bezier(0.2, 0, 0, 1)) instead of Tailwind's stock
 * 150ms cubic-bezier(0.4, 0, 0.2, 1). The `motion` tokens stay in sync.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const CSS = read("../index.css").replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = read("../components/animate-ui/motion-tokens.ts");

describe("tailwind default transition", () => {
  it("is the spec fast token", () => {
    expect(CSS).toContain("--default-transition-duration: 120ms;");
    expect(CSS).toContain("--default-transition-timing-function: cubic-bezier(0.2, 0, 0, 1);");
  });

  it("exposes the standard curve as an ease utility", () => {
    expect(CSS).toContain("--ease-standard: cubic-bezier(0.2, 0, 0, 1);");
  });
});

describe("motion tokens", () => {
  it("still matches the spec durations", () => {
    expect(TOKENS).toMatch(/fast:\s*0\.12/);
    expect(TOKENS).toMatch(/base:\s*0\.2\b/);
    expect(TOKENS).toMatch(/slow:\s*0\.3\b/);
  });
});
