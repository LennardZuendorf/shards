import { call } from "../transport";

/** Drop `undefined` keys so the core sees an absent argument, not `null`. */
export function clean<T extends object>(args: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (v !== undefined) out[k] = v;
  return out;
}

/** Typed call with undefined-stripping. */
export function invokeTool<T>(tool: string, args: object = {}): Promise<T> {
  return call<T>(tool, clean(args));
}

/**
 * Tag-spec string for `*_update` tools: bare `x,y` adds, `+x,-y` adds/removes, `=x,y` replaces.
 * `tagSpec.replace(["a","b"])` → `"=a,b"`.
 */
export const tagSpec = {
  add: (tags: string[]) => tags.map((t) => `+${t}`).join(","),
  remove: (tags: string[]) => tags.map((t) => `-${t}`).join(","),
  /** `=` with an empty list clears every tag. */
  replace: (tags: string[]) => `=${tags.join(",")}`,
  diff: (before: string[], after: string[]) => {
    const add = after.filter((t) => !before.includes(t)).map((t) => `+${t}`);
    const rm = before.filter((t) => !after.includes(t)).map((t) => `-${t}`);
    return [...add, ...rm].join(",");
  },
};

/** Default `limit` for list calls the UI aggregates (the core defaults to 20). */
export const ALL = 2000;
