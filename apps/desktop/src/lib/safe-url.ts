/** URL classification for untrusted Markdown (see components/shared/safe-markdown.tsx). */
export type HrefKind = "hash" | "external" | "inert";

const here = () => (typeof window !== "undefined" ? window.location.href : "http://localhost/");

/** Classify an href against the app's own location. */
export function classifyHref(href: string | null | undefined, base: string = here()): { kind: HrefKind; url: string | null } {
  if (!href) return { kind: "inert", url: null };
  if (href.startsWith("#")) return { kind: "hash", url: href };
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return { kind: "inert", url: null };
  }
  const origin = new URL(base).origin;
  if ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== origin) return { kind: "external", url: u.href };
  if (u.protocol === "mailto:") return { kind: "external", url: u.href };
  return { kind: "inert", url: null };
}

/** Classify an image source: local (data:, blob:, same origin) renders, remote waits for a click. */
export function classifyImage(src: string | null | undefined, base: string = here()): "local" | "remote" | "invalid" {
  if (!src) return "invalid";
  if (/^(data:image\/|blob:)/i.test(src)) return "local";
  try {
    const u = new URL(src, base);
    if (u.origin === new URL(base).origin) return "local";
    return u.protocol === "http:" || u.protocol === "https:" ? "remote" : "invalid";
  } catch {
    return "invalid";
  }
}

export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
