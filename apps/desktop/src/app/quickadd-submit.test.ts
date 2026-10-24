import { describe, expect, it } from "vitest";
import type { Member, Project } from "@/lib/types";
import { resolveQuickAddSubmit, type QuickAddSubmitInput, type QuickAddSubmitResult } from "./quickadd-submit";

const NOW = new Date(2026, 9, 22, 9, 0, 0);

const PROJECTS: Project[] = [{ id: "prj-home", title: "Home", sections: ["Errands"], open_count: 0 }];

const MEMBERS: Member[] = [
  { id: "claude", name: "claude", kind: "agent" },
  { id: "claudette", name: "Claudette", kind: "human" },
];

const KNOWN: QuickAddSubmitInput["known"] = {
  project: ["Home"],
  section: ["Errands"],
  label: ["admin"],
  owner: ["claude"],
};

function submit(patch: Partial<QuickAddSubmitInput> & Pick<QuickAddSubmitInput, "text">): QuickAddSubmitResult {
  return resolveQuickAddSubmit({
    known: KNOWN,
    over: {},
    defaults: {},
    projects: PROJECTS,
    members: MEMBERS,
    now: NOW,
    ...patch,
  });
}

describe("resolveQuickAddSubmit", () => {
  it("maps the full R13 phrase to the task payload", () => {
    const result = submit({
      text: "Renew passport #Home /Errands @admin p2 +claude next fri {oct 31}",
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.title).toBe("Renew passport");
    expect(result.args).toEqual({
      title: "Renew passport",
      priority: "high",
      tags: ["admin"],
      owner: "claude",
      project: "prj-home",
      body: undefined,
      due: "2026-10-30",
      deadline: "2026-10-31",
      recur: undefined,
      recur_from: undefined,
      section: "Errands",
      parent: undefined,
    });
  });

  it("keeps an unknown project out of the vault and warns", () => {
    const result = submit({ text: "Fix bike #Nope" });

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Fix bike");
    expect(result.warnings).toEqual([`No project “Nope” — added to Inbox.`]);
    expect(result.args?.project).toBeUndefined();
  });

  it("names the current project in the unknown-project warning", () => {
    const result = submit({ text: "Fix bike #Nope", defaults: { project: "prj-home" } });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([`No project “Nope” — added to Home.`]);
    expect(result.args?.project).toBe("prj-home");
  });

  it("blocks the submit on an unknown owner", () => {
    const result = submit({ text: "Ping +ghost" });

    expect(result.ok).toBe(false);
    expect(result.args).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.blocked).toEqual({ status: "unknown", raw: "ghost" });
  });

  it("applies context defaults", () => {
    const result = submit({
      text: "Buy milk",
      defaults: {
        project: "prj-home",
        section: "Errands",
        due: "2026-10-22",
        priority: "low",
        labels: ["admin"],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Buy milk");
    expect(result.args).toMatchObject({
      title: "Buy milk",
      project: "prj-home",
      section: "Errands",
      due: "2026-10-22",
      priority: "low",
      tags: ["admin"],
    });
  });

  it("lets a phrase token beat the default priority", () => {
    const result = submit({ text: "Call mom p1", defaults: { priority: "low" } });

    expect(result.ok).toBe(true);
    expect(result.args?.priority).toBe("urgent");
  });

  it("drops a label the user removed", () => {
    const result = submit({ text: "Buy milk @admin", droppedLabels: ["admin"] });

    expect(result.ok).toBe(true);
    expect(result.args?.tags).toBeUndefined();
  });

  it("keeps recurrence from completion and the deadline", () => {
    const result = submit({ text: "Water plants every! 3 days {nov 1}" });

    expect(result.ok).toBe(true);
    expect(result.args?.recur).toBe("FREQ=DAILY;INTERVAL=3");
    expect(result.args?.recur_from).toBe("completion");
    expect(result.args?.deadline).toBe("2026-11-01");
  });

  it("rejects empty and whitespace-only text", () => {
    for (const text of ["", "   "]) {
      const result = submit({ text });
      expect(result.ok).toBe(false);
      expect(result.title).toBe("");
      expect(result.args).toBeNull();
      expect(result.warnings).toEqual([]);
    }
  });

  it("turns a description into a body paragraph", () => {
    expect(submit({ text: "Buy milk", description: "line one" }).args?.body).toBe("line one\n");
    expect(submit({ text: "Buy milk", description: "  " }).args?.body).toBeUndefined();
  });

  it("reports an ambiguous owner", () => {
    const result = submit({ text: "Ping +cl" });

    expect(result.ok).toBe(false);
    expect(result.args).toBeNull();
    expect(result.blocked?.status).toBe("ambiguous");
    expect(result.blocked?.raw).toBe("cl");
  });
});
