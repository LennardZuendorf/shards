/**
 * Shared user-facing copy (programme Slice A, item 10). One "not saved" warning, so the wording
 * lives in one place instead of being re-spelled at every call site.
 */

/** Fields a vault whose core predates them silently drops. */
export function notSaved(fields: readonly string[]): string {
  return `Not saved: ${fields.join(", ")}. This vault’s core is older than the app.`;
}
