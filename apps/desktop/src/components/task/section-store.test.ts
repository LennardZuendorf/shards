import { describe, expect, it } from "vitest";
import { pinnedOrder } from "./section-store";

describe("pinnedOrder", () => {
  it("pins the shown order when nothing is stored", () => {
    expect(pinnedOrder([], ["Bills", "Errands", "House"])).toEqual(["Bills", "Errands", "House"]);
  });

  it("pins when a shown section is missing from the stored list", () => {
    expect(pinnedOrder(["Bills"], ["Bills", "Errands"])).toEqual(["Bills", "Errands"]);
  });

  it("writes nothing when the stored list already holds every shown section", () => {
    expect(pinnedOrder(["Bills", "Errands", "House"], ["Bills", "Errands", "House"])).toBeNull();
  });

  it("writes nothing for a project without sections", () => {
    expect(pinnedOrder([], [])).toBeNull();
    expect(pinnedOrder([], [""])).toBeNull();
  });
});
