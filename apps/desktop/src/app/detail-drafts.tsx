import { useState, type ReactNode } from "react";
import { createDetailDraftStore, DraftContext } from "./detail-draft-state";

/** Owns target-scoped drafts above the responsive presentation branches. */
export function DetailDraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDetailDraftStore);
  return <DraftContext value={store}>{children}</DraftContext>;
}
