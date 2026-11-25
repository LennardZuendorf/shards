/**
 * Sidebar project order: the `order` number the drop path writes.
 *
 * `host_projects` already sorts by `order` and `host_project_update {order}` writes it (proven
 * against the real vault in `crates/shards-host/tests/host_tools.rs`); this file covers the app
 * half — the shown order and the writes a drop produces.
 */
import { describe, expect, it } from "vitest";
import { ORDER_STEP, planReorder } from "@/components/task/model";
import { orderProjects, planProjectOrder } from "./project-order";

const p = (id: string, title: string, order?: number | null) => ({ id, title, order });

describe("orderProjects", () => {
  it("sorts by order, then puts the unranked rows last by title", () => {
    const rows = [p("c", "Garden", 2048), p("a", "Home", null), p("b", "Work", 1024), p("d", "Art")];
    expect(orderProjects(rows).map((x) => x.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("is stable for equal titles and ignores a stale non-number", () => {
    const rows = [p("z", "Same", 1024), p("y", "Same", 1024), p("x", "Same", Number.NaN as unknown as number)];
    expect(orderProjects(rows).map((x) => x.id)).toEqual(["y", "z", "x"]);
  });

  it("leaves an already-ordered list untouched", () => {
    const rows = [p("a", "A", 1024), p("b", "B", 2048), p("c", "C", 3072)];
    expect(orderProjects(rows).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planProjectOrder", () => {
  const shown = [p("a", "A", 1024), p("b", "B", 2048), p("c", "C", 3072), p("d", "D", 4096)];

  it("moves the third row to the top with one midpoint write", () => {
    expect(planProjectOrder(shown, "c", 0)).toEqual([{ id: "c", order: 0 }]);
  });

  it("moves the first row to the bottom with one midpoint write", () => {
    expect(planProjectOrder(shown, "a", 3)).toEqual([{ id: "a", order: 5120 }]);
  });

  it("drops the moved row exactly where planReorder would", () => {
    for (const to of [0, 1, 2, 3]) {
      expect(planProjectOrder(shown, "d", to)).toEqual(planReorder(shown.filter((x) => x.id !== "d"), "d", to));
    }
  });

  it("renumbers a list nobody has dragged, in one pass", () => {
    const fresh = [p("a", "A"), p("b", "B"), p("c", "C")];
    expect(planProjectOrder(fresh, "c", 0)).toEqual([
      { id: "c", order: ORDER_STEP },
      { id: "a", order: ORDER_STEP * 2 },
      { id: "b", order: ORDER_STEP * 3 },
    ]);
  });

  it("renumbers when the list is only partly ranked, so the drop can hold", () => {
    const partly = [p("a", "A", 1024), p("b", "B", null), p("c", "C", 3072)];
    expect(planProjectOrder(partly, "c", 0)).toEqual([
      { id: "c", order: ORDER_STEP },
      { id: "a", order: ORDER_STEP * 2 },
      { id: "b", order: ORDER_STEP * 3 },
    ]);
  });

  it("leaves a row with no project note out of the plan and lands the drop before it", () => {
    // `host_projects` lists an id only a task names (`from_note: false`) after the note-backed
    // rows; that row has no file, so a write for it would fail the whole batch.
    const ghost = { id: "n-GHOST", title: "n-GHOST", order: null, from_note: false };
    const rows = [p("a", "A", 1024), p("b", "B", 2048), ghost];
    expect(orderProjects(rows).map((x) => x.id)).toEqual(["a", "b", "n-GHOST"]);
    // Dropping "a" onto the ghost row puts it last among the real rows, and writes nothing at all
    // for the ghost — the plan is the same one the two real rows alone would produce.
    expect(planProjectOrder(orderProjects(rows), "a", 2)).toEqual(planReorder([{ id: "b", order: 2048 }], "a", 1));
    expect(planProjectOrder(orderProjects(rows), "a", 2).some((w) => w.id === "n-GHOST")).toBe(false);
  });

  it("writes nothing when the dragged row itself has no project note", () => {
    const ghost = { id: "n-GHOST", title: "n-GHOST", order: null, from_note: false };
    expect(planProjectOrder([p("a", "A", 1024), ghost], "n-GHOST", 0)).toEqual([]);
  });
});
