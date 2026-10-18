import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/quickadd/parse";
import { isEmptyVault, MCP_SNIPPET, QUICK_ADD_EXAMPLE } from "./onboarding";

describe("isEmptyVault", () => {
  it("is true only when both counts are known and zero", () => {
    expect(isEmptyVault(0, 0)).toBe(true);
    expect(isEmptyVault(1, 0)).toBe(false);
    expect(isEmptyVault(0, 1)).toBe(false);
    expect(isEmptyVault(undefined, 0)).toBe(false);
    expect(isEmptyVault(0, undefined)).toBe(false);
    expect(isEmptyVault(null, null)).toBe(false);
  });
});

describe("onboarding copy", () => {
  it("offers a quick-add example that parses into date, priority and label", () => {
    const p = parseQuickAdd(QUICK_ADD_EXAMPLE);
    expect(p.title).toBe("Call Sam");
    expect(p.priority).toBe("high");
    expect(p.labels).toEqual(["phone"]);
    expect(p.due).toBeTruthy();
  });

  it("offers the Claude Code MCP command", () => {
    expect(MCP_SNIPPET).toBe("claude mcp add shards -- shards-mcp");
  });
});
