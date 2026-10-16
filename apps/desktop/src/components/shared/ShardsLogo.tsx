import { cn } from "@/lib/utils";

/** The Shards mark: three faceted violet shards (light / mid / shadow faces). */
export function ShardsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6", className)}>
      <defs>
        <linearGradient id="shards-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.15 293)" />
          <stop offset="1" stopColor="oklch(0.6 0.23 293)" />
        </linearGradient>
        <linearGradient id="shards-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.55 0.24 293)" />
          <stop offset="1" stopColor="oklch(0.42 0.2 290)" />
        </linearGradient>
      </defs>
      {/* tall shard */}
      <path d="M14.5 2 L21 13.5 L15.5 29 L9.5 14.5 Z" fill="url(#shards-a)" />
      <path d="M14.5 2 L15.5 29 L9.5 14.5 Z" fill="url(#shards-b)" opacity="0.9" />
      {/* right shard */}
      <path d="M23 9 L28.5 17 L23.5 26 L20 17.5 Z" fill="url(#shards-a)" opacity="0.85" />
      <path d="M23 9 L23.5 26 L20 17.5 Z" fill="url(#shards-b)" opacity="0.75" />
      {/* left chip */}
      <path d="M6 18 L8.5 22.5 L5.5 27 L3.5 22 Z" fill="url(#shards-a)" opacity="0.7" />
    </svg>
  );
}
