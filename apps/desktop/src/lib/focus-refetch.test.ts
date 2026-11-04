import { describe, expect, it } from "vitest";
import { shouldRefetchOnFocus } from "./focus-refetch";

describe("shouldRefetchOnFocus", () => {
  it("does not refetch while the stream is live", () => {
    expect(shouldRefetchOnFocus("live")).toBe(false);
  });

  it("refetches while the stream is connecting", () => {
    expect(shouldRefetchOnFocus("connecting")).toBe(true);
  });

  it("refetches while the stream is offline", () => {
    expect(shouldRefetchOnFocus("offline")).toBe(true);
  });
});
