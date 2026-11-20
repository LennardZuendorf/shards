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

/**
 * R25 tone for a refused write: name the writer whose newer text would have been overwritten.
 * The vault records no author on a body write, so `author` is the best attribution available
 * (the task's owner or the agent working on it) and may be absent.
 */
export function refusedSave(field: string, author?: string | null): string {
  return author
    ? `Can’t save — ${author} changed this ${field} since`
    : `Can’t save — this ${field} changed on disk since you started`;
}

/** R26 conflict banner: "Changed on disk by claude · 10:42". */
export function changedOnDisk(author: string | null, at: string | null): string {
  return [`Changed on disk${author ? ` by ${author}` : ""}`, at].filter(Boolean).join(" · ");
}
