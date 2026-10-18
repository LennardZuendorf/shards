/**
 * Tiny hash router. Routes live in `app/routes.tsx`; views read params with
 * `useRouteParams()` (never props), so a view module has no import back into the route table.
 *
 *   #/today   #/project/n-abc123   #/label/backend   #/search?q=foo   #/notes/n-1
 */
import { useSyncExternalStore } from "react";

export type RouteName =
  | "inbox"
  | "today"
  | "upcoming"
  | "project"
  | "label"
  | "search"
  | "agents"
  | "memories"
  | "scratch"
  | "notes"
  | "settings";

/** Patterns: `:param` required, `:param?` optional (trailing only). */
export const ROUTE_PATTERNS: readonly [RouteName, string][] = [
  ["inbox", "/inbox"],
  ["today", "/today"],
  ["upcoming", "/upcoming"],
  ["project", "/project/:id"],
  ["label", "/label/:name"],
  ["search", "/search"],
  ["agents", "/agents/:id?"],
  ["memories", "/memories/:id?"],
  ["scratch", "/scratch/:agent?/:name?"],
  ["notes", "/notes/:id?"],
  ["settings", "/settings"],
];

export const DEFAULT_PATH = "/today";

export interface RouteMatch {
  name: RouteName;
  /** The path without query, e.g. `/project/n-1`. */
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

function compile(pattern: string): RegExp {
  const parts = pattern.split("/").filter(Boolean);
  let re = "^";
  for (const p of parts) {
    if (p.startsWith(":")) {
      const optional = p.endsWith("?");
      const name = p.slice(1).replace(/\?$/, "");
      re += optional ? `(?:/(?<${name}>[^/]+))?` : `/(?<${name}>[^/]+)`;
    } else {
      re += `/${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    }
  }
  return new RegExp(`${re}/?$`);
}

const COMPILED = ROUTE_PATTERNS.map(([name, pattern]) => [name, compile(pattern)] as const);

export function matchPath(full: string): RouteMatch {
  const [rawPath, rawQuery = ""] = full.split("?");
  const path = rawPath && rawPath !== "/" ? rawPath : DEFAULT_PATH;
  for (const [name, re] of COMPILED) {
    const m = re.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.groups ?? {})) if (v !== undefined) params[k] = decodeURIComponent(v);
      return { name, path, params, query: new URLSearchParams(rawQuery) };
    }
  }
  return { ...matchPath(DEFAULT_PATH), query: new URLSearchParams() };
}

const currentHashPath = () => {
  if (typeof window === "undefined") return DEFAULT_PATH;
  const h = window.location.hash.replace(/^#/, "");
  return h || DEFAULT_PATH;
};

let cached: { key: string; match: RouteMatch } | null = null;
function snapshot(): RouteMatch {
  const key = currentHashPath();
  if (!cached || cached.key !== key) cached = { key, match: matchPath(key) };
  return cached.match;
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Build a hash href for a path: `href("/today")` → `#/today`. */
export const href = (to: string) => `#${to.startsWith("/") ? to : `/${to}`}`;

/** Path builders so callers never hand-format URLs. */
export const paths = {
  inbox: () => "/inbox",
  today: () => "/today",
  upcoming: () => "/upcoming",
  project: (id: string) => `/project/${encodeURIComponent(id)}`,
  label: (name: string) => `/label/${encodeURIComponent(name)}`,
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  agents: (id?: string) => (id ? `/agents/${encodeURIComponent(id)}` : "/agents"),
  memories: (id?: string) => (id ? `/memories/${encodeURIComponent(id)}` : "/memories"),
  scratch: (agent?: string, name?: string) =>
    agent ? `/scratch/${encodeURIComponent(agent)}${name ? `/${encodeURIComponent(name)}` : ""}` : "/scratch",
  notes: (id?: string) => (id ? `/notes/${encodeURIComponent(id)}` : "/notes"),
  settings: () => "/settings",
};

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = href(to);
  if (window.location.hash === target) return;
  if (opts.replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

/** The current route (re-renders on hash change). */
export function useRoute(): RouteMatch {
  return useSyncExternalStore(subscribe, snapshot, () => matchPath(DEFAULT_PATH));
}

/** Params of the current route, e.g. `useRouteParams<{ id: string }>()` in ProjectView. */
export function useRouteParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useRoute().params as T;
}

/** Query string of the current route (e.g. `?q=` in SearchView). */
export function useRouteQuery(): URLSearchParams {
  return useRoute().query;
}

/** Set/replace query params on the current path without adding history entries. */
export function setRouteQuery(update: Record<string, string | null>) {
  const r = snapshot();
  const q = new URLSearchParams(r.query);
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  navigate(s ? `${r.path}?${s}` : r.path, { replace: true });
}
