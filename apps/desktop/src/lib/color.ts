/** Stable hues from ids (FNV-1a), for avatars, project dots and label icons. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A hue for an id, from a curated set of well-separated hues (no muddy olive/khaki band), so
 * neighbouring projects, labels and agents stay distinguishable in both themes.
 */
const HUES = [20, 45, 65, 140, 165, 190, 215, 240, 262, 290, 315, 345];
export function hueFromString(s: string): number {
  return HUES[hashString(s) % HUES.length];
}

/** Named project colors (Todoist-ish palette) → oklch. Unknown names pass through as CSS. */
const NAMED: Record<string, string> = {
  red: "oklch(0.63 0.21 25)",
  orange: "oklch(0.7 0.17 52)",
  yellow: "oklch(0.8 0.15 90)",
  green: "oklch(0.65 0.16 150)",
  teal: "oklch(0.66 0.11 190)",
  sky: "oklch(0.7 0.13 228)",
  blue: "oklch(0.6 0.16 255)",
  violet: "oklch(0.58 0.22 293)",
  purple: "oklch(0.58 0.22 293)",
  pink: "oklch(0.68 0.19 350)",
  gray: "oklch(0.65 0.01 286)",
  grey: "oklch(0.65 0.01 286)",
};

const PROJECT_PALETTE = ["blue", "green", "orange", "violet", "pink", "teal", "red", "yellow"] as const;

/**
 * Give every project without a configured `color` a distinct named palette color. Each starts
 * from its id's hash and steps past colors already taken (explicit ones first, then ids in
 * sorted order), so a project keeps its color unless a collision forces a neighbour.
 */
export function withProjectColors<T extends { id: string; color?: string | null }>(projects: T[]): T[] {
  const used = new Set(projects.flatMap((p) => (p.color ? [p.color.toLowerCase()] : [])));
  const assigned = new Map<string, string>();
  const open = projects.filter((p) => !p.color).map((p) => p.id).sort();
  for (const id of open) {
    let i = hashString(id) % PROJECT_PALETTE.length;
    for (let k = 0; k < PROJECT_PALETTE.length && used.has(PROJECT_PALETTE[i]); k++) i = (i + 1) % PROJECT_PALETTE.length;
    assigned.set(id, PROJECT_PALETTE[i]);
    used.add(PROJECT_PALETTE[i]);
  }
  return projects.map((p) => (p.color ? p : { ...p, color: assigned.get(p.id) ?? null }));
}

/** CSS color for an entity: explicit color (named or CSS) wins, else a hashed hue. */
export function entityColor(id: string, color?: string | null, l = 0.64, c = 0.15): string {
  if (color) return NAMED[color.toLowerCase()] ?? color;
  return `oklch(${l} ${c} ${hueFromString(id)})`;
}

/** Initials from a display name or id: two words → two letters ("claude-code" → "CC"), one word → one ("lennard" → "L"). */
export function initials(nameOrId: string): string {
  const words = nameOrId
    .replace(/[_.@-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? "?";
  return w.slice(0, 1).toUpperCase();
}
