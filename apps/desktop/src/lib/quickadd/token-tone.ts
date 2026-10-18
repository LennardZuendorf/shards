import type { TokenKind } from "./parse";

/**
 * Inline quick-add token classes (root design.md § Colors). `#project`, `/section`, `@label` and
 * `+assignee` stay neutral (their dot / avatar shape sits beside the chip); dates carry `info`,
 * a priority its own text hue, a deadline a danger outline. Colour lives in the text, never in a fill.
 */
export const TOKEN_CLS: Record<TokenKind, string> = {
  project: "text-foreground bg-muted",
  section: "text-muted-foreground bg-muted",
  label: "text-muted-foreground bg-muted",
  priority: "text-priority-urgent",
  owner: "text-foreground bg-muted",
  due: "text-info",
  recur: "text-info",
  deadline: "text-danger ring-1 ring-inset ring-danger/60",
};
