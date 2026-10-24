import { describe, expect, it } from "vitest";
import type { Asset, GraphNode, Memory } from "@/lib/types";
import {
  backlinkSources,
  linkKindOfId,
  outgoingTargets,
  resolveTarget,
  sortLinks,
  visibleLinks,
} from "./memory-links";

function mem(over: Partial<Memory> & { id: string }): Memory {
  return {
    type: "memory",
    title: over.id,
    tags: [],
    owner: null,
    created: null,
    updated: null,
    kind: "fact",
    scope: "shared",
    project: null,
    importance: 3,
    source: null,
    expires: null,
    superseded_by: null,
    ...over,
  };
}

const node = (over: Partial<GraphNode> & { id: string }): GraphNode => ({ type: "note", ...over });

function asset(over: Partial<Asset> & { id: string }): Asset {
  return {
    type: "asset",
    title: over.id,
    tags: [],
    owner: null,
    created: null,
    updated: null,
    filename: over.id,
    media_type: "image/png",
    bytes: 1,
    sha256: "0".repeat(64),
    blob: "blobs/0",
    ...over,
  };
}

describe("link targets", () => {
  it("classifies ids by their space prefix", () => {
    expect(linkKindOfId("m-A")).toBe("memory");
    expect(linkKindOfId("n-A")).toBe("note");
    expect(linkKindOfId("t-A")).toBe("task");
    expect(linkKindOfId("a-A")).toBe("asset");
    expect(linkKindOfId("x-A")).toBe("unknown");
  });

  it("prefers the loaded memory, then the graph node, then the raw id", () => {
    const memories = new Map([["m-A", mem({ id: "m-A", title: "Alpha", kind: "insight" })]]);
    const nodes = new Map([["m-A", node({ id: "m-A", type: "memory", title: "Stale" })]]);
    expect(resolveTarget("m-A", memories, nodes)).toEqual({
      id: "m-A",
      kind: "memory",
      title: "Alpha",
      subtype: "insight",
      missing: false,
    });

    expect(resolveTarget("n-B", new Map(), nodes)).toEqual({
      id: "n-B",
      kind: "note",
      title: "n-B",
      subtype: undefined,
      missing: true,
    });
  });

  it("resolves a note or task from the graph and keeps its subtype", () => {
    const nodes = new Map([
      ["n-B", node({ id: "n-B", type: "log", title: "Beta log" })],
      ["t-C", node({ id: "t-C", type: "task", title: "Gamma", status: "open" })],
    ]);
    expect(resolveTarget("n-B", new Map(), nodes)).toMatchObject({
      kind: "note",
      title: "Beta log",
      subtype: "log",
      missing: false,
    });
    expect(resolveTarget("t-C", new Map(), nodes)).toMatchObject({ kind: "task", title: "Gamma", missing: false });
  });

  it("keeps a dangling id visible as a missing asset", () => {
    expect(resolveTarget("a-Z", new Map(), new Map())).toEqual({
      id: "a-Z",
      kind: "asset",
      title: "a-Z",
      missing: true,
    });
  });

  it("resolves an asset from the asset index, not the graph", () => {
    const assets = new Map([["a-D", asset({ id: "a-D", title: "diagram.png" })]]);
    expect(resolveTarget("a-D", new Map(), new Map(), assets)).toEqual({
      id: "a-D",
      kind: "asset",
      title: "diagram.png",
      subtype: "image/png",
      missing: false,
    });
  });
});

describe("outgoing links", () => {
  const memories = new Map([["m-A", mem({ id: "m-A", title: "Alpha" })]]);

  it("preserves author order, dedupes, skips the seed and keeps broken ids", () => {
    const got = outgoingTargets(["t-B", "m-A", "n-C", "t-B", "a-D"], memories, new Map(), "m-A");
    expect(got.map((t) => [t.id, t.missing])).toEqual([
      ["t-B", true],
      ["n-C", true],
      ["a-D", true],
    ]);
  });

  it("is empty when the memory has no related list", () => {
    expect(outgoingTargets(undefined, memories, new Map(), "m-A")).toEqual([]);
  });
});

describe("backlinks", () => {
  it("finds plain inbound edges and excludes outbound-only neighbours", () => {
    const nodes = [
      node({ id: "n-IN", title: "In" }),
      node({ id: "n-OUT", title: "Out" }),
    ];
    const edges: [string, string][] = [
      ["n-IN", "m-SEED"],
      ["m-SEED", "n-OUT"],
    ];
    expect(backlinkSources("m-SEED", nodes, edges).map((n) => n.id)).toEqual(["n-IN"]);
  });

  it("catches a mutual link suppressed as an outbound edge", () => {
    const nodes = [node({ id: "m-FRIEND", type: "memory", related: ["m-SEED"] })];
    expect(backlinkSources("m-SEED", nodes, [["m-SEED", "m-FRIEND"]]).map((n) => n.id)).toEqual(["m-FRIEND"]);
  });

  it("never returns the seed, even when it links to itself", () => {
    const nodes = [node({ id: "m-SEED", type: "memory", related: ["m-SEED"] })];
    expect(backlinkSources("m-SEED", nodes, [["m-SEED", "m-SEED"]])).toEqual([]);
  });

  it("dedupes a source that both links and is edged", () => {
    const nodes = [node({ id: "n-IN", related: ["m-SEED"] })];
    expect(backlinkSources("m-SEED", nodes, [["n-IN", "m-SEED"]])).toHaveLength(1);
  });
});

describe("ordering and caps", () => {
  it("sorts by kind, then title, then id", () => {
    const targets = [
      { id: "t-2", kind: "task" as const, title: "B", missing: false },
      { id: "m-9", kind: "memory" as const, title: "Z", missing: false },
      { id: "n-1", kind: "note" as const, title: "A", missing: false },
      { id: "m-1", kind: "memory" as const, title: "A", missing: false },
    ];
    expect(sortLinks(targets).map((t) => t.id)).toEqual(["m-1", "m-9", "n-1", "t-2"]);
  });

  it("caps a hub list and reports the hidden count", () => {
    expect(visibleLinks([1, 2, 3], 2)).toEqual({ visible: [1, 2], hidden: 1 });
    expect(visibleLinks([1, 2], 2)).toEqual({ visible: [1, 2], hidden: 0 });
  });
});
