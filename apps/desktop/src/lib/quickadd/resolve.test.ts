import { describe, expect, it } from "vitest";
import type { Member } from "../types";
import { parseQuickAdd } from "./parse";
import { resolveOwner } from "./resolve";

const members: Member[] = [
  { id: "lennard", kind: "human", name: "Lennard" },
  { id: "claude-code", kind: "agent", name: "Claude Code" },
  { id: "flights-agent", kind: "agent", name: "Flights Agent" },
  { id: "ops-agent", kind: "agent", name: "Ops Agent" },
];
const known = { owner: members.flatMap((m) => [m.id, m.name]) };
const ownerOf = (input: string) => resolveOwner(parseQuickAdd(input, { known }).owner, members);

describe("resolveOwner", () => {
  it("resolves an exact id", () => {
    expect(resolveOwner("claude-code", members)).toEqual({ status: "resolved", member: members[1] });
  });

  it("resolves an exact name, ignoring case and punctuation", () => {
    expect(resolveOwner("flights agent", members)).toMatchObject({ status: "resolved", member: { id: "flights-agent" } });
  });

  it("resolves +claude to claude-code by a unique prefix", () => {
    expect(ownerOf("Review PR +claude")).toMatchObject({ status: "resolved", member: { id: "claude-code" } });
  });

  it("counts a member once when the prefix matches its id and its name", () => {
    expect(resolveOwner("cl", members)).toMatchObject({ status: "resolved", member: { id: "claude-code" } });
  });

  it("reports +zzz as unknown so the submit is blocked", () => {
    expect(ownerOf("Review PR +zzz")).toEqual({ status: "unknown", raw: "zzz" });
  });

  it("reports a prefix shared by several members as ambiguous", () => {
    const r = resolveOwner("f", [...members, { id: "fin-bot", kind: "agent", name: "Fin" }]);
    expect(r.status).toBe("ambiguous");
  });

  it("is none without an assignee", () => {
    expect(resolveOwner(null, members)).toEqual({ status: "none" });
    expect(ownerOf("Buy milk")).toEqual({ status: "none" });
  });
});
