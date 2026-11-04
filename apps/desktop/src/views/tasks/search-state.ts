export type SearchPanelState = "idle" | "loading" | "error" | "empty" | "results";

export interface SearchPanelInput {
  /** The trimmed query actually being searched; "" when the field is empty. */
  query: string;
  loading: boolean;
  /** True when the shards_search call rejected. */
  error: boolean;
  taskCount: number;
  otherCount: number;
}

export interface SearchPanel {
  state: SearchPanelState;
  /** True when there are local instant matches but the host search failed. */
  degraded: boolean;
}

export function searchPanelState(input: SearchPanelInput): SearchPanel {
  const matches = input.taskCount + input.otherCount;
  if (input.query === "") return { state: "idle", degraded: false };
  if (input.loading && matches === 0) return { state: "loading", degraded: false };
  if (input.error) {
    return matches > 0 ? { state: "results", degraded: true } : { state: "error", degraded: false };
  }
  if (!input.loading && matches === 0) return { state: "empty", degraded: false };
  return { state: "results", degraded: false };
}
