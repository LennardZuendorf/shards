import { describe, expect, it } from "vitest";
import { TOKEN_CLS } from "./token-tone";
import type { TokenKind } from "./parse";

const KINDS: TokenKind[] = ["project", "section", "label", "priority", "owner", "due", "recur", "deadline"];

describe("TOKEN_CLS (design.md § Colors: colour in the text, no tinted fills)", () => {
  it("covers every token kind", () => {
    expect(Object.keys(TOKEN_CLS).sort()).toEqual([...KINDS].sort());
  });

  it("uses only token classes, never raw colours", () => {
    for (const k of KINDS) expect(TOKEN_CLS[k]).not.toMatch(/oklch|hsl|rgb|#[0-9a-f]{3}|violet|purple|teal/i);
  });

  it("keeps project, section, label and owner neutral", () => {
    for (const k of ["project", "section", "label", "owner"] as const) {
      expect(TOKEN_CLS[k]).toMatch(/text-foreground|text-muted-foreground/);
      expect(TOKEN_CLS[k]).not.toMatch(/primary|info|danger|success|warning|priority|due-/);
    }
  });

  it("gives dates the info hue and a deadline a danger outline, with no tinted fills", () => {
    expect(TOKEN_CLS.due).toContain("text-info");
    expect(TOKEN_CLS.recur).toContain("text-info");
    expect(TOKEN_CLS.deadline).toContain("text-danger");
    expect(TOKEN_CLS.deadline).toMatch(/ring-1/);
    for (const k of ["due", "recur", "deadline", "priority"] as const) expect(TOKEN_CLS[k]).not.toMatch(/\bbg-(?!transparent)/);
  });
});
