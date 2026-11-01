/** Device appearance preferences; invalid storage never becomes a DOM attribute. */
export const STONES = ["flint", "jade", "moonstone", "sandstone"] as const;
export type Stone = (typeof STONES)[number];
export const STONE_STORAGE_KEY = "shards-stone";

export function parseStone(value: unknown): Stone {
  return typeof value === "string" && STONES.some((stone) => stone === value) ? value as Stone : "flint";
}
