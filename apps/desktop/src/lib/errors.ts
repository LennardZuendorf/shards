/** Human-readable explanations for transport and host errors (titles, next steps, raw detail). */
import { CallError } from "./transport";

export interface ExplainedError {
  kind: "offline" | "forbidden" | "outdated" | "disabled" | "other";
  title: string;
  /** What happened and what to do next, in plain words. */
  hint: string;
  /** The raw message, for a details line. */
  raw: string;
}

const rawOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function isUnknownToolError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const raw = e instanceof CallError ? `${e.message} ${e.raw}` : e.message;
  return /unknown tool/i.test(raw);
}

/** Map an error to a title + next step. `what` names the thing that failed ("tasks"). */
export function explainError(e: unknown, what = "this"): ExplainedError {
  const raw = rawOf(e);
  if (e instanceof CallError && e.offline) {
    return {
      kind: "offline",
      title: "Can’t reach the Shards host",
      hint: "Start the desktop app or `shards-host`. This view reconnects on its own.",
      raw,
    };
  }
  if (e instanceof CallError && e.kind === "forbidden") {
    return {
      kind: "forbidden",
      title: "The Shards host refused this page",
      hint: "The host only answers the Shards app (the desktop app or the dev UI on localhost:5173). Open Shards from that address.",
      raw,
    };
  }
  if (isUnknownToolError(e)) {
    return { kind: "outdated", title: `Couldn’t load ${what}`, hint: "This needs a newer Shards host. Update and restart it.", raw };
  }
  if (e instanceof CallError && e.kind === "validation" && /(disabled|not configured|space)/i.test(raw)) {
    return { kind: "disabled", title: `${what[0]?.toUpperCase() ?? ""}${what.slice(1)} are turned off`, hint: "Enable the space in your Shards config.", raw };
  }
  return { kind: "other", title: `Couldn’t load ${what}`, hint: raw, raw };
}
