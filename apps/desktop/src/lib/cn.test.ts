/**
 * The class merger must keep the custom type-scale tokens (`text-micro` etc.) next to a text
 * colour. A source-text test cannot see this: the stock merger treats `text-micro` as a colour
 * and silently drops it, so the element falls back to the inherited size.
 */
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

const SIZES = ["micro", "small", "body", "heading", "title", "display", "avatar"];

describe("cn keeps the type-scale tokens", () => {
  it.each(SIZES)("text-%s survives a following text colour", (size) => {
    expect(cn(`text-${size} leading-none`, "text-foreground")).toContain(`text-${size}`);
    expect(cn(`text-${size}`, "text-muted-foreground")).toBe(`text-${size} text-muted-foreground`);
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-sm", "text-small")).toBe("text-small");
    expect(cn("text-micro", "text-body")).toBe("text-body");
  });

  it("still lets a later colour replace an earlier one", () => {
    expect(cn("text-foreground", "text-muted-foreground")).toBe("text-muted-foreground");
  });
});
