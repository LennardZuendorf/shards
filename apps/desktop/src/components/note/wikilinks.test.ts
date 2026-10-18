import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { extractWikilinks, idTargetFromHref, parseWikilinks, remarkEntityIds, remarkWikilinks, resolveWikilink, wikiTargetFromHref, fileEntities } from "./wikilinks";

const BODY = "See [[Deploy runbook]] and [[n-1F4W|the project]].\n\n```\n[[not-a-link]]\n```\n\nInline `[[code]]` stays.";

describe("wikilinks", () => {
  it("parses targets and aliases", () => {
    expect(parseWikilinks("a [[x]] b [[y|Why]]")).toEqual([
      { target: "x", alias: null },
      { target: "y", alias: "Why" },
    ]);
  });

  it("skips fenced and inline code when extracting", () => {
    expect(extractWikilinks(BODY).map((w) => w.target)).toEqual(["Deploy runbook", "n-1F4W"]);
  });

  it("resolves by id, title (case-insensitive) and slug", () => {
    const ents = [
      { id: "n-1", title: "Deploy runbook" },
      { id: "t-9", title: "Fix it", type: "task" },
    ];
    expect(resolveWikilink("n-1", ents)).toMatchObject({ kind: "note", id: "n-1" });
    expect(resolveWikilink("deploy RUNBOOK", ents)).toMatchObject({ id: "n-1" });
    expect(resolveWikilink("deploy-runbook", ents)).toMatchObject({ id: "n-1" });
    expect(resolveWikilink("t-ABCD", ents)).toEqual({ kind: "task", id: "t-ABCD" });
    expect(resolveWikilink("m-ZZ12", [])).toEqual({ kind: "memory", id: "m-ZZ12" });
    expect(resolveWikilink("Nothing here", ents)).toBeNull();
  });

  it("renders links through react-markdown but not inside code", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkWikilinks] }, BODY));
    expect(html).toContain('href="#wiki:Deploy%20runbook"');
    expect(html).toContain(">the project</a>");
    expect(html).toContain("[[not-a-link]]");
    expect(html).toContain("<code>[[code]]</code>");
    expect(html).not.toContain("#wiki:not-a-link");
    expect(wikiTargetFromHref("#wiki:Deploy%20runbook")).toBe("Deploy runbook");
    expect(wikiTargetFromHref("https://x")).toBeNull();
  });
});

describe("bare entity ids", () => {
  const html = (md: string) => renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkWikilinks, remarkEntityIds] }, md));

  it("links ids in prose", () => {
    expect(html("Rotating staging keys (t-DPRR) now")).toContain('href="#id:t-DPRR"');
    expect(html("see m-AB12 and n-1F4W")).toContain('href="#id:n-1F4W"');
  });

  it("skips code spans, fences, existing links and look-alikes", () => {
    const out = html("`t-DPRR`\n\n```\nt-ABCD\n```\n\n[t-WXYZ](https://x.example) split-ABCD t-ab12");
    expect(out).not.toContain("#id:");
  });

  it("reads the id back from the href", () => {
    expect(idTargetFromHref("#id:t-DPRR")).toBe("t-DPRR");
    expect(idTargetFromHref("#wiki:x")).toBeNull();
  });
});

describe("file entities (notes browser)", () => {
  const files = fileEntities([
    { path: "Daily/2026-10-14 standup.md", title: "2026-10-14 standup" },
    { path: "Projects/Release plan.md", title: "Release Plan v2" },
  ]);

  it("resolves Obsidian-style links by title, file name and path", () => {
    expect(resolveWikilink("Release Plan v2", files)).toMatchObject({ kind: "file", id: "file:Projects/Release plan.md" });
    expect(resolveWikilink("Release plan", files)).toMatchObject({ kind: "file", id: "file:Projects/Release plan.md" });
    expect(resolveWikilink("Daily/2026-10-14 standup", files)).toMatchObject({ kind: "file", id: "file:Daily/2026-10-14 standup.md" });
  });

  it("drops a heading or block suffix", () => {
    expect(resolveWikilink("Release plan#Scope", files)).toMatchObject({ kind: "file" });
    expect(resolveWikilink("Release plan#^abc123", files)).toMatchObject({ kind: "file" });
    expect(resolveWikilink("Nope#Scope", files)).toBeNull();
  });

  it("prefers a Shards note listed before the files", () => {
    const all = [{ id: "n-1ABC", title: "Release plan", type: "note" }, ...files];
    expect(resolveWikilink("Release plan", all)).toMatchObject({ kind: "note", id: "n-1ABC" });
  });
});
