import { cn } from "@/lib/utils";

/** The Shards mark: three faceted shards, monochrome (`currentColor`; facets differ by opacity). The app icon keeps its own colours. */
export function ShardsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden fill="currentColor" className={cn("size-6 text-foreground", className)}>
      {/* tall shard */}
      <path d="M14.5 2 L21 13.5 L15.5 29 L9.5 14.5 Z" opacity="0.6" />
      <path d="M14.5 2 L15.5 29 L9.5 14.5 Z" />
      {/* right shard */}
      <path d="M23 9 L28.5 17 L23.5 26 L20 17.5 Z" opacity="0.5" />
      <path d="M23 9 L23.5 26 L20 17.5 Z" opacity="0.8" />
      {/* left chip */}
      <path d="M6 18 L8.5 22.5 L5.5 27 L3.5 22 Z" opacity="0.4" />
    </svg>
  );
}
