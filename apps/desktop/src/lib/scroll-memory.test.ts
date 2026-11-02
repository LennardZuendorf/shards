import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED_PATHS,
  MAX_SCROLL_TOP,
  clearScrollMemory,
  clampScrollTop,
  forgetScroll,
  recallScroll,
  rememberScroll,
  rememberedScrollPaths,
  restoreScrollTop,
} from "./scroll-memory";

/** A scroller with only what `restoreScrollTop` touches; `scrollTop` behaves like the real setter. */
function scroller({ scrollHeight = 400, clientHeight = 400, top = 0 } = {}) {
  const el = {
    scrollHeight,
    clientHeight,
    scrollTop: top,
    isConnected: true,
  };
  return el as unknown as HTMLElement & { scrollHeight: number; scrollTop: number };
}

/** Node has no frame clock, so the test drives it: each entry is one pending frame callback. */
const frames: FrameRequestCallback[] = [];
const runFrame = () => frames.shift()?.(0);

beforeEach(() => {
  clearScrollMemory();
  frames.length = 0;
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  globalThis.cancelAnimationFrame = () => {
    frames.length = 0;
  };
});

describe("scroll memory", () => {
  beforeEach(() => clearScrollMemory());

  it("recalls the offset it remembered for each path", () => {
    rememberScroll("/today", 320);
    rememberScroll("/project/n-1", 90);
    expect(recallScroll("/today")).toBe(320);
    expect(recallScroll("/project/n-1")).toBe(90);
  });

  it("has no offset for a path it has never seen", () => {
    rememberScroll("/today", 320);
    expect(recallScroll("/settings")).toBeUndefined();
  });

  it("overwrites a path's offset instead of growing a second entry", () => {
    rememberScroll("/today", 320);
    rememberScroll("/today", 40);
    expect(recallScroll("/today")).toBe(40);
    expect(rememberedScrollPaths()).toEqual(["/today"]);
  });

  it("clamps to whole, non-negative pixels within MAX_SCROLL_TOP", () => {
    rememberScroll("/today", -80);
    expect(recallScroll("/today")).toBe(0);
    rememberScroll("/today", 12.6);
    expect(recallScroll("/today")).toBe(13);
    rememberScroll("/today", MAX_SCROLL_TOP * 10);
    expect(recallScroll("/today")).toBe(MAX_SCROLL_TOP);
    rememberScroll("/today", Number.NaN);
    expect(recallScroll("/today")).toBe(0);
    expect(clampScrollTop(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("stays bounded, dropping the least recently remembered path first", () => {
    for (let i = 0; i < MAX_REMEMBERED_PATHS + 5; i++) rememberScroll(`/project/n-${i}`, i + 1);
    expect(rememberedScrollPaths()).toHaveLength(MAX_REMEMBERED_PATHS);
    expect(recallScroll("/project/n-0")).toBeUndefined();
    expect(recallScroll("/project/n-4")).toBeUndefined();
    expect(recallScroll("/project/n-5")).toBe(6);
    expect(recallScroll(`/project/n-${MAX_REMEMBERED_PATHS + 4}`)).toBe(MAX_REMEMBERED_PATHS + 5);
  });

  it("treats a re-remembered path as recently used, so it survives the next eviction", () => {
    for (let i = 0; i < MAX_REMEMBERED_PATHS; i++) rememberScroll(`/p/${i}`, 10);
    rememberScroll("/p/0", 20);
    rememberScroll("/p/new", 30);
    expect(recallScroll("/p/0")).toBe(20);
    expect(recallScroll("/p/1")).toBeUndefined();
  });

  it("forgets a path on request and ignores an empty path", () => {
    rememberScroll("/today", 320);
    forgetScroll("/today");
    expect(recallScroll("/today")).toBeUndefined();
    rememberScroll("", 100);
    expect(rememberedScrollPaths()).toEqual([]);
  });

  it("restores a remembered offset in one paint when the content is already tall enough", () => {
    const el = scroller({ scrollHeight: 2000 });
    const stop = restoreScrollTop(el, 320);
    expect(el.scrollTop).toBe(320);
    expect(frames).toHaveLength(0);
    stop();
  });

  it("waits for the next frame while the view is still short, so an early restore cannot stick at the top", () => {
    // A Suspense skeleton: nothing to scroll yet.
    const el = scroller({ scrollHeight: 400 });
    const stop = restoreScrollTop(el, 320);
    expect(el.scrollTop).toBe(0);
    expect(frames).toHaveLength(1);
    // The view paints its rows on the next frame; the retry lands the remembered offset.
    el.scrollHeight = 2000;
    runFrame();
    expect(el.scrollTop).toBe(320);
    expect(frames).toHaveLength(0);
    stop();
  });

  it("gives up after maxFrames instead of retrying forever", () => {
    const el = scroller({ scrollHeight: 400 });
    const stop = restoreScrollTop(el, 320, 2);
    runFrame();
    runFrame();
    expect(frames).toHaveLength(0);
    el.scrollHeight = 2000;
    expect(el.scrollTop).toBe(0);
    stop();
  });

  it("stops fighting a reader who scrolls during the retry window", () => {
    const el = scroller({ scrollHeight: 400 });
    const stop = restoreScrollTop(el, 320);
    el.scrollTop = 40;
    runFrame();
    expect(el.scrollTop).toBe(40);
    expect(frames).toHaveLength(0);
    stop();
  });

  it("stops retrying once cancelled and never restores beyond MAX_SCROLL_TOP", () => {
    const el = scroller({ scrollHeight: 400 });
    const stop = restoreScrollTop(el, MAX_SCROLL_TOP * 4);
    expect(el.scrollTop).toBe(0);
    stop();
    expect(frames).toHaveLength(0);

    const tall = scroller({ scrollHeight: 100_000 });
    restoreScrollTop(tall, MAX_SCROLL_TOP * 4)();
    expect(tall.scrollTop).toBe(MAX_SCROLL_TOP);
  });
});
