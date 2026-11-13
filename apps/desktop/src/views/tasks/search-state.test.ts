import { describe, expect, it } from "vitest";
import { searchPanelState, type SearchPanelInput } from "./search-state";

const base: SearchPanelInput = { query: "zeppelin", loading: false, error: false, taskCount: 0, otherCount: 0 };

describe("searchPanelState", () => {
  it("is idle for an empty query even with an error", () => {
    expect(searchPanelState({ ...base, query: "", error: true })).toEqual({ state: "idle", degraded: false });
  });

  it("is error, never empty, when the host search fails with no matches", () => {
    expect(searchPanelState({ ...base, error: true })).toEqual({ state: "error", degraded: false });
  });

  it("keeps other-space matches and degrades when the host search fails", () => {
    expect(searchPanelState({ ...base, error: true, otherCount: 1 })).toEqual({ state: "results", degraded: true });
  });

  it("keeps task matches and degrades when the host search fails", () => {
    expect(searchPanelState({ ...base, error: true, taskCount: 1 })).toEqual({ state: "results", degraded: true });
  });

  it("is empty when the search succeeds with no matches", () => {
    expect(searchPanelState(base)).toEqual({ state: "empty", degraded: false });
  });

  it("is results, not degraded, when matches exist without an error", () => {
    expect(searchPanelState({ ...base, taskCount: 2 })).toEqual({ state: "results", degraded: false });
  });

  it("is loading while the search runs with no matches", () => {
    expect(searchPanelState({ ...base, loading: true })).toEqual({ state: "loading", degraded: false });
  });
});
