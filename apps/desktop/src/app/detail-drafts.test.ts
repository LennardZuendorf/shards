import { expect, it } from "vitest";
import { createDetailDraftStore } from "./detail-draft-state";

it("retains whole editing state when a responsive editor reattaches", () => {
  const store = createDetailDraftStore();
  expect(store.read("description", { text: "original", editing: false })).toEqual({ text: "original", editing: false });
  store.write("description", { text: "unsaved", editing: true });
  expect(store.read("description", { text: "external edit", editing: false })).toEqual({ text: "unsaved", editing: true });
  expect(createDetailDraftStore().read("description", "other target")).toBe("other target");
});
it("notifies consumers for functional updates and ignores identical state", () => {
  const store = createDetailDraftStore(); let changes = 0;
  store.read("comment", ""); const off = store.subscribe(() => changes++);
  store.write<string>("comment", value => value + "draft");
  store.write("comment", "draft");
  expect(store.read("comment", "")).toBe("draft"); expect(changes).toBe(1);
  off(); store.write("comment", "second"); expect(changes).toBe(1);
});
