import { describe, expect, it } from "vitest";
import { byteLength, formatBytes, liveness, parseChecklist, parseScratchKey, previewText, toggleChecklistLine } from "./scratch-utils";

const BODY = "# Plan\n- [x] Read BUILD.md\n- [ ] Build view\n```\n- [ ] not a task\n```\n  * [X] nested done";

describe("checklist", () => {
  it("parses items outside code fences", () => {
    const c = parseChecklist(BODY);
    expect(c.total).toBe(3);
    expect(c.done).toBe(2);
    expect(c.items.map((i) => i.text)).toEqual(["Read BUILD.md", "Build view", "nested done"]);
  });

  it("toggles one line and leaves others intact", () => {
    const next = toggleChecklistLine(BODY, 2);
    expect(next.split("\n")[2]).toBe("- [x] Build view");
    expect(toggleChecklistLine(next, 2)).toBe(BODY);
    expect(toggleChecklistLine(BODY, 0)).toBe(BODY);
  });
});

describe("liveness and sizes", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("buckets by age", () => {
    expect(liveness("2026-10-15T11:59:00Z", now)).toBe("live");
    expect(liveness("2026-10-15T11:50:00Z", now)).toBe("active");
    expect(liveness("2026-10-15T11:31:00Z", now)).toBe("active");
    expect(liveness("2026-10-15T01:00:00Z", now)).toBe("idle");
    expect(liveness("2026-10-12T01:00:00Z", now)).toBe("dormant");
    expect(liveness("2026-09-01T01:00:00Z", now)).toBe("stale");
    expect(liveness(null, now)).toBe("dormant");
  });

  it("counts UTF-8 bytes, not UTF-16 units", () => {
    expect(byteLength("é")).toBe(2);
    expect(byteLength("🙂")).toBe(4);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("builds previews and parses keys", () => {
    expect(previewText(BODY, 2)).toBe("Plan\n• Read BUILD.md");
    expect(parseScratchKey("claude-code/plan")).toEqual({ agent: "claude-code", name: "plan" });
    expect(parseScratchKey("nope")).toBeNull();
  });
});
