/**
 * Shards motion tokens (.spec/design.md frontmatter `motion`), shared by the `components/ui`
 * wrappers and the reduced-motion patches in the vendored animate-ui primitives.
 */
import type { Transition } from "motion/react";

/** design.md `motion.easing.standard`: cubic-bezier(0.2, 0, 0, 1). */
export const EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1];

/** design.md `motion.durations`, in seconds. */
export const DURATION = { fast: 0.12, base: 0.2, slow: 0.3 } as const;

/** Hover, press, tooltips. */
export const TRANSITION_FAST: Transition = { duration: DURATION.fast, ease: EASE_STANDARD };
/** Popovers, menus, dialogs, collapsibles. */
export const TRANSITION_BASE: Transition = { duration: DURATION.base, ease: EASE_STANDARD };
/** The detail sheet. */
export const TRANSITION_SLOW: Transition = { duration: DURATION.slow, ease: EASE_STANDARD };

/**
 * Under `prefers-reduced-motion: reduce`: an opacity fade of at most 120ms (design.md
 * `motion.reduced`). Patched primitives use it instead of the caller's transition.
 */
export const TRANSITION_REDUCED: Transition = { duration: DURATION.fast, ease: "linear" };
