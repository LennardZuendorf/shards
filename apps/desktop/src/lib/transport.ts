import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ErrorEnvelope } from "./types";

/** What `shards_call` and `POST /api/call/{tool}` both return. */
export interface CallResult<T> {
  value: T;
  list: boolean;
}

export interface VaultChange {
  spaces: string[];
  paths: string[];
}

/** Parse the core's JSON error envelope out of a domain error message, if it is one. */
function parseEnvelope(message: string): ErrorEnvelope | null {
  const t = message.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && "message" in v) return v as ErrorEnvelope;
  } catch {
    /* not JSON */
  }
  return null;
}

export class CallError extends Error {
  kind: string;
  /** The core's envelope (`{kind, message, next_action, …}`) for domain errors. */
  envelope: ErrorEnvelope | null;
  /** The raw message as received (the envelope JSON for domain errors). */
  raw: string;
  tool: string;
  constructor(kind: string, message: string, tool = "") {
    const envelope = parseEnvelope(message);
    super(envelope?.message ?? message);
    this.name = "CallError";
    this.kind = envelope?.kind ?? kind;
    this.envelope = envelope;
    this.raw = message;
    this.tool = tool;
  }
  /** True when the host could not be reached at all (browser mode, host not running). */
  get offline(): boolean {
    return this.kind === "network";
  }
}

/** One transport, two backends: Tauri IPC in the app, HTTP in a plain browser. */
export async function call<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) {
    try {
      const r = await invoke<CallResult<T>>("shards_call", { tool, args });
      return r.value;
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      throw new CallError(err.kind ?? "unknown", err.message ?? String(e), tool);
    }
  }
  let r: Response;
  try {
    r = await fetch(`/api/call/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shards-client": "1" },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new CallError("network", `Shards host unreachable (${(e as Error).message})`, tool);
  }
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    // shards-host always answers JSON; anything else is the dev proxy failing to reach it.
    if (!r.ok) throw new CallError("network", `Shards host unreachable (${r.status} ${r.statusText})`, tool);
  }
  if (!r.ok) {
    const b = (body ?? {}) as { kind?: string; message?: string };
    throw new CallError(b.kind ?? "http", b.message ?? r.statusText, tool);
  }
  return (body as CallResult<T>).value;
}

export type ConnectionState = "connecting" | "live" | "offline";

/** How often the browser-mode watchdog probes `/api/health` while the stream looks open. */
const HEALTH_EVERY_MS = 10_000;
const HEALTH_TIMEOUT_MS = 4_000;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/**
 * Subscribe to vault change events. `onState` reports the live channel's health
 * (Tauri is always live once the listener attaches).
 *
 * Browser mode cannot trust EventSource alone: a proxy may keep a dead stream open, keep-alive
 * comments are invisible to scripts, and a failed reconnect (502) closes the EventSource for
 * good. So a watchdog probes `/api/health` every 10 s; on failure it drops the stream, reports
 * "offline" and reconnects with backoff. A named `ping` event (if the host sends one) and any
 * change event count as proof of life too.
 */
export function onVaultChanged(
  cb: (e: VaultChange) => void,
  onState?: (s: ConnectionState) => void,
): () => void {
  if (isTauri()) {
    const p = listen<VaultChange>("vault://changed", (e) => cb(e.payload));
    p.then(() => onState?.("live")).catch(() => onState?.("offline"));
    return () => {
      p.then((unlisten) => unlisten()).catch(() => {});
    };
  }
  if (typeof EventSource === "undefined") {
    onState?.("offline");
    return () => {};
  }

  let es: EventSource | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastSeen = Date.now();
  let state: ConnectionState | null = null;
  const report = (s: ConnectionState) => {
    if (s === state) return;
    state = s;
    onState?.(s);
  };

  const teardown = () => {
    if (es) {
      es.close();
      es = null;
    }
    if (retry) clearTimeout(retry);
    retry = null;
  };

  const scheduleReconnect = () => {
    teardown();
    if (stopped) return;
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    retry = setTimeout(connect, wait);
  };

  const healthy = async (): Promise<boolean> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS);
    try {
      const r = await fetch("/api/health", { cache: "no-store", signal: ctl.signal });
      return r.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };

  function connect() {
    if (stopped) return;
    report("connecting");
    const source = new EventSource("/api/events");
    es = source;
    source.addEventListener("open", () => {
      if (es !== source) return;
      attempt = 0;
      lastSeen = Date.now();
      report("live");
    });
    source.addEventListener("error", () => {
      if (es !== source) return;
      if (source.readyState === EventSource.CLOSED) {
        // The browser gave up (e.g. the proxy answered 502): retry ourselves.
        report("offline");
        scheduleReconnect();
      } else {
        report("connecting");
      }
    });
    const alive = () => {
      lastSeen = Date.now();
    };
    source.addEventListener("ping", alive);
    source.addEventListener("vault-changed", (m) => {
      alive();
      try {
        cb(JSON.parse((m as MessageEvent).data) as VaultChange);
      } catch {
        /* ignore malformed frame */
      }
    });
  }

  watchdog = setInterval(() => {
    if (stopped || !es || es.readyState !== EventSource.OPEN) return;
    if (Date.now() - lastSeen < HEALTH_EVERY_MS - 500) return;
    const source = es;
    void healthy().then((ok) => {
      if (stopped || es !== source) return;
      if (ok) {
        lastSeen = Date.now();
        return;
      }
      // The host is gone but the stream still looks open: drop it and reconnect.
      report("offline");
      scheduleReconnect();
    });
  }, HEALTH_EVERY_MS);

  connect();
  return () => {
    stopped = true;
    teardown();
    if (watchdog) clearInterval(watchdog);
  };
}

export const runtime = (): "tauri" | "browser" => (isTauri() ? "tauri" : "browser");
