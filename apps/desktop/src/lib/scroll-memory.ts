/**
 * Scroll memory for the app's single scroller (`#main`), keyed by route path.
 *
 * `product.md` promises that opening a project and coming back "restores its scroll position".
 * The key is the **path**, not the route name: `project/:id` is one name over one scroller, so two
 * projects must never inherit each other's offset, and neither may a filtered `/label/:name`.
 *
 * This is module state rather than React state on purpose: it has to outlive the unmount a route
 * change causes, and nothing renders from it.
 */

/** Furthest offset we will restore; one absurd value cannot strand a reader thousands of px down. */
export const MAX_SCROLL_TOP = 20_000;

/** Paths we keep an offset for; the least recently used one is dropped first. */
export const MAX_REMEMBERED_PATHS = 40;

const offsets = new Map<string, number>();

/** Whole, non-negative pixels, capped at `MAX_SCROLL_TOP`. Garbage in (NaN) reads as the top. */
export function clampScrollTop(top: number): number {
  if (!Number.isFinite(top)) return 0;
  return Math.min(Math.max(Math.round(top), 0), MAX_SCROLL_TOP);
}

/** Remember where the reader was on `path`. Re-remembering refreshes its recency. */
export function rememberScroll(path: string, top: number): void {
  if (!path) return;
  // Delete first so the map's insertion order stays least → most recently used.
  offsets.delete(path);
  offsets.set(path, clampScrollTop(top));
  while (offsets.size > MAX_REMEMBERED_PATHS) {
    const oldest = offsets.keys().next();
    if (oldest.done) break;
    offsets.delete(oldest.value);
  }
}

/** The remembered offset for `path`, or `undefined` when it has never been remembered. */
export function recallScroll(path: string): number | undefined {
  return path ? offsets.get(path) : undefined;
}

export function forgetScroll(path: string): void {
  offsets.delete(path);
}

export function clearScrollMemory(): void {
  offsets.clear();
}

/** Remembered paths, least → most recent. Exists so tests can assert the bound. */
export function rememberedScrollPaths(): string[] {
  return [...offsets.keys()];
}

/**
 * Put `el` at `top`, retrying on the next frame while the content is still shorter than that offset:
 * a route's first paint can be a Suspense skeleton, and an early restore would clamp to it. Gives up
 * after `maxFrames`, and stops as soon as the reader scrolls themselves. Returns a cancel function.
 */
export function restoreScrollTop(el: HTMLElement, top: number, maxFrames = 30): () => void {
  const goal = clampScrollTop(top);
  let frames = 0;
  let applied: number | null = null;
  let handle = 0;
  let stopped = false;
  const apply = () => {
    if (stopped || !el.isConnected) return;
    // Someone scrolled during the retry window: the scroller is theirs now.
    if (applied !== null && Math.abs(el.scrollTop - applied) > 1) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    applied = Math.min(goal, max);
    el.scrollTop = applied;
    if (goal <= max || frames++ >= maxFrames) return;
    handle = requestAnimationFrame(apply);
  };
  apply();
  return () => {
    stopped = true;
    if (handle) cancelAnimationFrame(handle);
  };
}
