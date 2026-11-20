import type { ReactNode } from "react";
import { createDetailDraftStore, DraftContext } from "./detail-draft-state";

type DraftStore = ReturnType<typeof createDetailDraftStore>;

/**
 * One store per target, kept for the session, so opening another task and coming back does not
 * throw an unsaved draft away (R10/R26: a refused description draft stays until it is resolved).
 * Bounded by the items the operator opens — which is exactly what the drafts are for.
 */
const stores = new Map<string, DraftStore>();

export function detailDraftStoreFor(targetKey: string): DraftStore {
  let store = stores.get(targetKey);
  if (!store) {
    store = createDetailDraftStore();
    stores.set(targetKey, store);
  }
  return store;
}

/** Test seam: forget every retained store. */
export function resetDetailDraftStores() {
  stores.clear();
}

/** Owns target-scoped drafts above the responsive presentation branches. */
export function DetailDraftProvider({ targetKey, children }: { targetKey: string; children: ReactNode }) {
  return <DraftContext value={detailDraftStoreFor(targetKey)}>{children}</DraftContext>;
}
