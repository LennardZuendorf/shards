import { useState } from "react";

const UNSEEN: readonly unknown[] = [];

/**
 * Run `reset` during render on the first render and whenever `deps` change (React's "adjusting
 * state when a prop changes"), instead of a `useEffect` that sets state after a stale first
 * paint. Same trigger points as `useEffect(reset, deps)`. `reset` may only set state of the
 * calling component.
 */
export function useRenderReset(deps: readonly unknown[], reset: () => void) {
  const [prev, setPrev] = useState<readonly unknown[]>(UNSEEN);
  if (prev === UNSEEN || deps.length !== prev.length || deps.some((d, i) => !Object.is(d, prev[i]))) {
    setPrev(deps);
    reset();
  }
}
