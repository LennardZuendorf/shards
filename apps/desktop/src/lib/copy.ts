/**
 * Shared clipboard confirmations and unsupported-field warnings.
 */

/** Bare clipboard action -> "Copied"; named payload -> "Copied the path". */
export function copied(noun?: string | null): string {
  return noun ? `Copied the ${noun}` : "Copied";
}

/** Fields a vault whose core predates them silently drops. */
export function notSaved(fields: readonly string[]): string {
  return `Not saved: ${fields.join(", ")}. This vault’s core is older than the app.`;
}
