/**
 * The two strings several surfaces share (programme Slice A, item 10). One clipboard rule and
 * one "not saved" warning, so the wording lives in one place and is testable.
 */

/** Bare clipboard action -> "Copied"; named payload -> "Copied the path". */
export function copied(noun?: string | null): string {
  return noun ? `Copied the ${noun}` : "Copied";
}

/** Fields a vault whose core predates them silently drops. */
export function notSaved(fields: readonly string[]): string {
  return `Not saved: ${fields.join(", ")}. This vault’s core is older than the app.`;
}
