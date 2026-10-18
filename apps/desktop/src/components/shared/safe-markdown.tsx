/**
 * Link and image renderers shared by every Markdown surface. Note, memory, scratch and task
 * bodies are written by agents and sync, so they are untrusted:
 * - links to another origin open outside the app (never navigate the app window away);
 * - in-page `#…` links stay in the app; other relative or odd hrefs render as plain text;
 * - remote images load only after a click (no tracking / exfiltration beacons on render).
 */
import { ImageIcon } from "lucide-react";
import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { classifyHref, classifyImage, openExternal } from "@/lib/safe-url";

type AnchorProps = ComponentProps<"a"> & { node?: unknown };

/** `a` override for react-markdown. */
export function SafeLink({ href, children, node: _node, onClick, ...rest }: AnchorProps) {
  const { kind, url } = classifyHref(href);
  if (kind === "inert" || !url) {
    return (
      <span className="text-foreground/80" title={href ?? undefined}>
        {children}
      </span>
    );
  }
  if (kind === "hash") return <a href={url} {...rest} onClick={onClick}>{children}</a>;
  return (
    <a
      {...rest}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={rest.title ?? url}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
        openExternal(url);
      }}
    >
      {children}
    </a>
  );
}

type ImgProps = ComponentProps<"img"> & { node?: unknown };

/** `img` override for react-markdown. */
export function SafeImage({ src, alt, title, node: _node }: ImgProps) {
  const [load, setLoad] = useState(false);
  const s = typeof src === "string" ? src : undefined;
  const kind = classifyImage(s);
  if (kind === "invalid") return <span className="text-muted-foreground">{alt ? `[${alt}]` : null}</span>;
  if (kind === "local" || load) {
    return <img src={s} alt={alt ?? ""} title={title} loading="lazy" referrerPolicy="no-referrer" decoding="async" />;
  }
  let host: ReactNode = s;
  try {
    host = new URL(s ?? "").host;
  } catch {
    /* keep the raw src */
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setLoad(true);
      }}
      title={s}
      className="my-1 inline-flex max-w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
    >
      <ImageIcon className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground/80">{alt || "Remote image"}</span>
        <span className="block truncate">Load from {host}</span>
      </span>
    </button>
  );
}
