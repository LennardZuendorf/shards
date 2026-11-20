/**
 * DoD 3 — a per-target draft store survives switching task.
 *
 * The detail pane keeps one store per target for the session, so returning to a task shows the
 * draft it was left with instead of the body on disk (R10/R26: a kept description draft stays
 * until the operator resolves it). Rendered without a DOM, like the rest of this harness: the
 * component tree is the real one, only the pane's key changes between renders.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { DetailDraftProvider, detailDraftStoreFor, resetDetailDraftStores } from "./detail-drafts";
import { useDetailDraftController } from "./detail-draft-state";

/**
 * Reads the draft the way the editor's client snapshot does. `useDetailDraftState` renders its
 * *server* snapshot (the loaded value) under `renderToStaticMarkup`, so the harness reads the
 * store through the same context the editor uses instead.
 */
function Description({ loaded }: { loaded: string }) {
  const store = useDetailDraftController();
  return <span data-detail-field="description-draft">{store ? store.read("description-draft", loaded) : loaded}</span>;
}

const pane = (targetKey: string, loaded: string) =>
  renderToStaticMarkup(
    <DetailDraftProvider targetKey={targetKey}>
      <Description loaded={loaded} />
    </DetailDraftProvider>,
  );

beforeEach(() => {
  resetDetailDraftStores();
});

describe("detail pane drafts", () => {
  it("keeps an unsaved description while another task is open", () => {
    expect(pane("task:t-1", "First task on disk")).toContain("First task on disk");
    // The operator types, then opens another task (the pane remounts for the new target).
    detailDraftStoreFor("task:t-1").write("description-draft", "Half-written first task");
    expect(pane("task:t-2", "Second task on disk")).toContain("Second task on disk");
    expect(pane("task:t-2", "Second task on disk")).not.toContain("Half-written");
    // Back to the first task: the editor still holds the draft, not the older body.
    expect(pane("task:t-1", "First task on disk")).toContain("Half-written first task");
  });

  it("gives every target its own store and reuses it for that target", () => {
    expect(detailDraftStoreFor("task:t-1")).not.toBe(detailDraftStoreFor("task:t-2"));
    expect(detailDraftStoreFor("task:t-1")).toBe(detailDraftStoreFor("task:t-1"));
  });
});
