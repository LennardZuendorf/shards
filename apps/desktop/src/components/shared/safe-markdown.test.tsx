import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { classifyHref, classifyImage } from "@/lib/safe-url";
import { SafeImage, SafeLink } from "./safe-markdown";

const BASE = "http://localhost:5173/#/notes/n-1";

describe("classifyHref", () => {
  it("keeps in-page hashes in the app", () => {
    expect(classifyHref("#/notes/n-2", BASE)).toEqual({ kind: "hash", url: "#/notes/n-2" });
  });

  it("opens other origins externally, including protocol-relative links", () => {
    expect(classifyHref("https://example.com/x", BASE)).toEqual({ kind: "external", url: "https://example.com/x" });
    expect(classifyHref("//evil.example/x", BASE)).toEqual({ kind: "external", url: "http://evil.example/x" });
    expect(classifyHref("mailto:a@b.c", BASE).kind).toBe("external");
  });

  it("renders relative, same-origin and odd hrefs as text", () => {
    expect(classifyHref("foo", BASE).kind).toBe("inert");
    expect(classifyHref("/api/call/host_restore", BASE).kind).toBe("inert");
    expect(classifyHref("javascript:alert(1)", BASE).kind).toBe("inert");
    expect(classifyHref("tauri://localhost/x", BASE).kind).toBe("inert");
    expect(classifyHref(undefined, BASE).kind).toBe("inert");
  });
});

describe("classifyImage", () => {
  it("loads local sources and holds remote ones", () => {
    expect(classifyImage("data:image/png;base64,AAAA", BASE)).toBe("local");
    expect(classifyImage("/logo.png", BASE)).toBe("local");
    expect(classifyImage("https://evil.example/beacon.png?d=secret", BASE)).toBe("remote");
    expect(classifyImage("javascript:alert(1)", BASE)).toBe("invalid");
  });
});

describe("rendered markdown", () => {
  const render = (md: string) =>
    renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SafeLink, img: SafeImage }}>
        {md}
      </ReactMarkdown>,
    );

  it("never emits a remote <img> on render", () => {
    const html = render("![x](https://evil.example/beacon.png?d=secret)");
    expect(html).not.toContain("<img");
    expect(html).toContain("Load from evil.example");
  });

  it("turns protocol-relative and relative links into safe output", () => {
    const html = render("[i](//evil.example/x) and [r](foo)");
    expect(html).toContain('href="http://evil.example/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('href="foo"');
  });
});
